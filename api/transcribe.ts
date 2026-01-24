
import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
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

// 1MB Chunk = ~1-2 mins of audio. Small enough for fast upload, large enough for context.
const CHUNK_SIZE_BYTES = 1024 * 1024; 

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  const { downloadUrl, duration, currentTime = 0 } = req.body;
  if (!downloadUrl) return res.status(400).json({ error: 'Missing downloadUrl' });

  // Start Streaming Response Immediately (Heartbeat)
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'X-Content-Type-Options': 'nosniff'
  });

  res.write(': status: initializing\n');

  let tempFilePath: string | null = null;
  let uploadResult: any = null;

  try {
    // 1. Calculate Byte Range
    // -----------------------
    let totalBytes = 0;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const headRes = await fetch(downloadUrl, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeoutId);
        const cl = headRes.headers.get('content-length');
        if (cl) totalBytes = parseInt(cl, 10);
    } catch (e) { /* ignore */ }

    const ratio = Math.min(Math.max(currentTime / (duration || 1), 0), 1);
    const estimatedStart = totalBytes > 0 ? Math.floor(totalBytes * ratio) : 0;
    const startByte = Math.max(0, estimatedStart - (64 * 1024)); // 64KB Rewind
    const endByte = startByte + CHUNK_SIZE_BYTES;
    const rangeHeader = `bytes=${startByte}-${endByte}`;

    // 2. Download Chunk to Temp File
    // ----------------------------
    res.write(': status: downloading_audio\n');
    
    tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.mp3`);
    
    const audioRes = await fetch(downloadUrl, { headers: { 'Range': rangeHeader } });
    if (!audioRes.ok && audioRes.status !== 206) throw new Error(`Source returned ${audioRes.status}`);
    if (!audioRes.body) throw new Error("No body");

    const fileStream = createWriteStream(tempFilePath);
    // @ts-ignore
    await pipeline(audioRes.body, fileStream);
    
    // 3. Upload to Google AI
    // ---------------------
    res.write(': status: uploading_to_gemini\n');
    
    const fileManager = new GoogleAIFileManager(apiKey);
    uploadResult = await fileManager.uploadFile(tempFilePath, {
        mimeType: "audio/mp3",
        displayName: "Audio Chunk",
    });

    // 4. Poll for Processing
    // --------------------
    let file = await fileManager.getFile(uploadResult.file.name);
    let attempts = 0;
    while (file.state === FileState.PROCESSING && attempts < 20) {
        res.write(': status: processing_file\n'); // Heartbeat
        await new Promise((resolve) => setTimeout(resolve, 1000));
        file = await fileManager.getFile(uploadResult.file.name);
        attempts++;
    }

    if (file.state === FileState.FAILED) throw new Error("Google File Processing Failed");

    // 5. Generate with Vercel AI SDK
    // ----------------------------
    res.write(': status: generating_transcript\n');

    const result = await streamText({
      model: google('gemini-1.5-flash'),
      messages: [
        {
          role: 'user',
          content: [
            { 
               type: 'text', 
               text: `Transcribe this audio. Speaker diarization enabled. Output strictly JSONL. 
               Schema: {"start": "HH:MM:SS.mmm", "end": "HH:MM:SS.mmm", "speaker": "Name", "text": "Text", "background_noise": "Description"}` 
            },
            { 
               type: 'file', 
               data: uploadResult.file.uri, 
               mimeType: 'audio/mp3' 
            }
          ]
        }
      ]
    });

    // 6. Pipe AI Stream to Response
    // ---------------------------
    // streamText returns a readable stream of text parts. We pipe it manually to res.
    for await (const textPart of result.textStream) {
        res.write(textPart);
    }

  } catch (error: any) {
    console.error('[Transcribe Error]', error);
    res.write(`\nERROR: ${error.message}\n`);
  } finally {
    // Cleanup
    if (tempFilePath) {
       fs.unlink(tempFilePath, () => {}); // Async delete
    }
    // Delete from Google to save storage (fire and forget)
    if (uploadResult) {
        const fileManager = new GoogleAIFileManager(apiKey);
        fileManager.deleteFile(uploadResult.file.name).catch(() => {});
    }
    res.end();
  }
}
