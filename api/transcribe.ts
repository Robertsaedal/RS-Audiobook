
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: true,
  },
};

// 1MB Chunk = ~1-2 mins of audio. 
const CHUNK_SIZE_BYTES = 1024 * 1024; 

export default async function handler(req: any, res: any) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Support both API_KEY (standard) and GEMINI_API_KEY (project specific)
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Server Error: Missing API Key. Ensure API_KEY or GEMINI_API_KEY is set.");
    return res.status(500).json({ error: 'Server Configuration Error: Missing API Key' });
  }

  const { downloadUrl, duration, currentTime = 0 } = req.body;

  // 2. Validation
  try {
    if (!downloadUrl) throw new Error("Missing downloadUrl");
    new URL(downloadUrl); // Strict URL validation
  } catch (e: any) {
    return res.status(400).json({ error: `Invalid URL: ${e.message}`, stage: 'validation' });
  }

  const ai = new GoogleGenAI({ apiKey });
  let tempFilePath: string | null = null;
  let uploadResult: any = null;

  try {
    // 3. Pre-Calculation & Fetching (Before Headers)
    
    let startByte = 0;
    let endByte = CHUNK_SIZE_BYTES;

    // Attempt to get file size with a short timeout
    try {
        const headController = new AbortController();
        const headTimeout = setTimeout(() => headController.abort(), 2000); // 2s max for HEAD
        
        const headRes = await fetch(downloadUrl, { method: 'HEAD', signal: headController.signal });
        clearTimeout(headTimeout);

        const cl = headRes.headers.get('content-length');
        if (cl) {
            const totalBytes = parseInt(cl, 10);
            const ratio = Math.min(Math.max(currentTime / (duration || 1), 0), 1);
            const estimatedStart = totalBytes > 0 ? Math.floor(totalBytes * ratio) : 0;
            startByte = Math.max(0, estimatedStart - (64 * 1024)); // 64KB rewind
            endByte = startByte + CHUNK_SIZE_BYTES;
        }
    } catch (e) {
        console.warn("Head request failed, defaulting to 0 start", e);
    }

    const rangeHeader = `bytes=${startByte}-${endByte}`;

    // MAIN FETCH with 15s Timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    console.log(`[Transcribe] Fetching: ${downloadUrl} (${rangeHeader})`);
    
    const audioRes = await fetch(downloadUrl, { 
        headers: { 'Range': rangeHeader },
        signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!audioRes.ok && audioRes.status !== 206) {
        throw new Error(`Upstream server returned status ${audioRes.status}`);
    }
    if (!audioRes.body) throw new Error("No response body received from upstream");

    // ---------------------------------------------------------
    // If we reach here, we have the stream. Send Heartbeat headers.
    // ---------------------------------------------------------
    res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Content-Type-Options': 'nosniff'
    });

    res.write(': status: downloading_audio\n');

    // 4. Download to Temp File
    tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.mp3`);
    const fileStream = createWriteStream(tempFilePath);
    // @ts-ignore
    await pipeline(audioRes.body, fileStream);

    // 5. Upload to Google
    res.write(': status: uploading_to_gemini\n');
    
    // In @google/genai, upload returns the File object directly, not { file: File }
    uploadResult = await ai.files.upload({
        file: tempFilePath,
        config: {
            mimeType: "audio/mp3",
            displayName: "Audio Segment",
        }
    });

    // 6. Poll Processing
    let file = await ai.files.get({ name: uploadResult.name });
    let attempts = 0;
    while (file.state === 'PROCESSING' && attempts < 30) {
        res.write(': status: processing_file\n');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        file = await ai.files.get({ name: uploadResult.name });
        attempts++;
    }

    if (file.state === 'FAILED') {
        throw new Error("Google AI File Processing Failed");
    }

    // 7. Generate Stream
    res.write(': status: generating_transcript\n');

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash-exp',
      contents: [
        {
          role: 'user',
          parts: [
            { 
               text: `You are a professional transcriber.
               Task: Transcribe the audio file precisely.
               Format: Output strictly JSONL (JSON Lines). Each line must be a valid JSON object.
               Do NOT use markdown code blocks. Do NOT output an array.
               Schema: {"start": "HH:MM:SS.mmm", "end": "HH:MM:SS.mmm", "speaker": "Speaker Name", "text": "Content"}
               Speaker Diarization: Enabled.` 
            },
            { 
               fileData: { 
                   mimeType: file.mimeType, 
                   fileUri: file.uri 
               } 
            }
          ]
        }
      ]
    });

    for await (const chunk of responseStream) {
        res.write(chunk.text);
    }

  } catch (error: any) {
    console.error('[Transcribe Error]', error);

    // If headers haven't been sent, we can send a proper JSON error
    if (!res.headersSent) {
        const isTimeout = error.name === 'AbortError';
        return res.status(500).json({ 
            error: isTimeout ? 'Upstream request timed out (15s)' : error.message, 
            stage: 'fetching-audio' 
        });
    } else {
        // Headers already sent, must write error to stream so client detects it
        res.write(`\nERROR: ${error.message}\n`);
    }
  } finally {
    // 8. Robust Cleanup
    if (tempFilePath) {
       fs.unlink(tempFilePath, (err) => {
           if (err) console.error("Failed to delete temp file:", err);
       });
    }
    if (uploadResult && uploadResult.name) {
        // Ensure file is deleted from Google Storage
        try {
            await ai.files.delete({ name: uploadResult.name });
            console.log(`[Cleanup] Deleted remote file: ${uploadResult.name}`);
        } catch (e) {
            console.error(`[Cleanup] Failed to delete remote file: ${uploadResult.name}`, e);
        }
    }
    res.end();
  }
}
