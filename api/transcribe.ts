
import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

export const config = {
  maxDuration: 60, // Extend function duration for file processing
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

  const apiKey = process.env.API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  const { downloadUrl, duration, currentTime = 0 } = req.body;
  if (!downloadUrl) return res.status(400).json({ error: 'Missing downloadUrl' });

  // 2. Start Streaming Immediately (Heartbeat)
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'X-Content-Type-Options': 'nosniff'
  });

  res.write(': status: initializing\n');

  let tempFilePath: string | null = null;

  try {
    const ai = new GoogleGenAI({ apiKey });

    // 3. Calculate Byte Range
    let totalBytes = 0;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const headRes = await fetch(downloadUrl, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeoutId);
        const cl = headRes.headers.get('content-length');
        if (cl) totalBytes = parseInt(cl, 10);
    } catch (e) { /* ignore head errors */ }

    const ratio = Math.min(Math.max(currentTime / (duration || 1), 0), 1);
    const estimatedStart = totalBytes > 0 ? Math.floor(totalBytes * ratio) : 0;
    const startByte = Math.max(0, estimatedStart - (64 * 1024)); // 64KB rewind context
    const endByte = startByte + CHUNK_SIZE_BYTES;
    const rangeHeader = `bytes=${startByte}-${endByte}`;

    // 4. Download Chunk to /tmp
    res.write(': status: downloading_audio\n');
    
    tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.mp3`);
    
    const audioRes = await fetch(downloadUrl, { headers: { 'Range': rangeHeader } });
    if (!audioRes.ok && audioRes.status !== 206) throw new Error(`Source returned ${audioRes.status}`);
    if (!audioRes.body) throw new Error("No body");

    const fileStream = createWriteStream(tempFilePath);
    // @ts-ignore
    await pipeline(audioRes.body, fileStream);
    
    // 5. Read to Buffer and Encode Base64 (Inline Data)
    res.write(': status: preparing_audio\n');
    const audioBuffer = await fs.promises.readFile(tempFilePath);
    const base64Audio = audioBuffer.toString('base64');

    // 6. Generate with Gemini API
    res.write(': status: generating_transcript\n');

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: {
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
             inlineData: {
               mimeType: 'audio/mp3',
               data: base64Audio
             } 
          }
        ]
      }
    });

    // 7. Pipe text chunks to response
    for await (const chunk of responseStream) {
        if (chunk.text) {
            res.write(chunk.text);
        }
    }

  } catch (error: any) {
    console.error('[Transcribe Error]', error);
    // Write error to stream so client sees it even if 200 OK was sent
    res.write(`\nERROR: ${error.message}\n`);
  } finally {
    // 8. Cleanup
    if (tempFilePath) {
       fs.unlink(tempFilePath, () => {});
    }
    res.end();
  }
}
