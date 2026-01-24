
import { GoogleGenAI } from "@google/genai";
import { PassThrough } from 'stream';

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: true,
  },
};

// Use a slightly smaller chunk for safer execution in serverless environments
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; 

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Correct: Always use process.env.API_KEY directly as per guidelines.
  const apiKey = process.env.API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server misconfiguration: Missing API Key' });

  const { downloadUrl, duration, currentTime = 0 } = req.body;
  if (!downloadUrl) return res.status(400).json({ error: 'Missing downloadUrl' });

  let uploadedFileName = '';

  try {
    console.log(`[Transcribe] Processing request for: ${downloadUrl.split('?')[0]}`);
    
    // 1. Determine download range
    let totalBytes = 0;
    try {
      const headRes = await fetch(downloadUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      const cl = headRes.headers.get('content-length');
      if (cl) totalBytes = parseInt(cl, 10);
    } catch (e) {
      console.warn("[Transcribe] HEAD request failed, continuing with stream discovery");
    }

    let startByte = 0;
    let endByte: number | null = null;
    
    if (totalBytes > MAX_UPLOAD_SIZE) {
      const ratio = Math.min(Math.max(currentTime / (duration || 1), 0), 1);
      const estimatedStart = Math.floor(totalBytes * ratio);
      // Start 1MB before current time for context
      startByte = Math.max(0, estimatedStart - (1024 * 1024)); 
      endByte = Math.min(startByte + MAX_UPLOAD_SIZE - 1, totalBytes - 1);
    }

    // 2. Start Download from Source (ABS)
    console.log(`[Transcribe] Downloading audio range: ${startByte}-${endByte || 'end'}`);
    const sourceRes = await fetch(downloadUrl, {
      headers: endByte !== null ? { 'Range': `bytes=${startByte}-${endByte}` } : {},
      signal: AbortSignal.timeout(15000) // 15s timeout to start download
    });

    if (!sourceRes.ok && sourceRes.status !== 206) {
      const sourceErr = await sourceRes.text().catch(() => 'No body');
      throw new Error(`Failed to reach audio source (Status ${sourceRes.status}): ${sourceErr.substring(0, 50)}`);
    }

    if (!sourceRes.body) throw new Error("Audio source returned empty body");

    const uploadLength = sourceRes.headers.get('content-length');
    const actualUploadSize = uploadLength ? parseInt(uploadLength, 10) : 0;

    // 3. Resumable Upload to Google Gemini
    const uploadBaseUrl = "https://generativelanguage.googleapis.com/upload/v1beta/files";
    const initRes = await fetch(`${uploadBaseUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': actualUploadSize ? actualUploadSize.toString() : '',
            'X-Goog-Upload-Header-Content-Type': 'audio/mpeg',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ file: { display_name: `transcription_${Date.now()}.mp3` } })
    });

    if (!initRes.ok) {
        const initErr = await initRes.text();
        throw new Error(`Google Upload Init Failed (${initRes.status}): ${initErr}`);
    }
    
    const uploadUrl = initRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error("Google API did not return an upload session URL");

    // Pipe the stream
    // Fix: Cast to any because 'duplex' is required for streaming but missing in some TypeScript RequestInit definitions.
    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Command': 'upload, finalize',
            'X-Goog-Upload-Offset': '0'
        },
        // @ts-ignore
        body: sourceRes.body, 
        duplex: 'half'
    } as any);

    if (!uploadRes.ok) {
        const uploadErr = await uploadRes.text();
        throw new Error(`Google Stream Upload Failed (${uploadRes.status}): ${uploadErr}`);
    }
    
    const uploadData = await uploadRes.json();
    uploadedFileName = uploadData.file.name;
    const fileUri = uploadData.file.uri;

    // 4. Start AI Transcription Stream
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked'
    });

    // Correct: Initialize GoogleGenAI with a named parameter using process.env.API_KEY.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let isReady = false;
    let attempts = 0;

    while (!isReady && attempts < 30) {
        const file = await ai.files.get({ name: uploadedFileName });
        if (file.state === 'ACTIVE') {
            isReady = true;
        } else if (file.state === 'FAILED') {
            throw new Error('Google File Processing Failed');
        } else {
            res.write(': processing...\n'); 
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }
    }

    if (!isReady) throw new Error("Google processing timeout (file did not become ACTIVE)");

    const promptText = `
    You are a high-precision transcription engine. 
    Transcribe the provided audio segment.
    
    OUTPUT FORMAT:
    - Output ONLY valid JSON objects, one per line (JSONL).
    - No markdown, no intro/outro.
    - Identify speakers (Narrator, Speaker A, Speaker B).
    - Capture meaningful background sounds in [brackets].

    SCHEMA:
    {"start": "HH:MM:SS.mmm", "end": "HH:MM:SS.mmm", "speaker": "Name", "text": "...", "background_noise": "..."}
    `;

    const response = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { fileData: { mimeType: 'audio/mpeg', fileUri: fileUri } },
          { text: promptText }
        ]
      }
    });

    for await (const chunk of response) {
        // Correct: Access the .text property directly (getter).
        const text = chunk.text;
        if (text) res.write(text);
    }

  } catch (error: any) {
    console.error('[Transcribe API Error]', error);
    if (res.headersSent) {
        res.write(`\nERROR: ${error.message}`);
    } else {
        res.status(500).json({ error: error.message || 'Internal Transcription Error' });
    }
  } finally {
    if (uploadedFileName) {
        try {
            await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploadedFileName}?key=${apiKey}`, {
                method: 'DELETE'
            });
        } catch (e) { }
    }
    res.end();
  }
}
