
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from 'ffmpeg-static';

// Configure ffmpeg path
if (ffmpegInstaller) {
    ffmpeg.setFfmpegPath(ffmpegInstaller);
}

export const config = {
  maxDuration: 60, // Vercel execution timeout (s)
  api: {
    bodyParser: true,
  },
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(req: any, res: any) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server Configuration Error: Missing API Key' });
  }

  const { downloadUrl, currentTime = 0 } = req.body;

  try {
    if (!downloadUrl) throw new Error("Missing downloadUrl");
  } catch (e: any) {
    return res.status(400).json({ error: `Invalid URL: ${e.message}`, stage: 'validation' });
  }

  const ai = new GoogleGenAI({ apiKey });
  // Use .mp3 extension for maximum compatibility with Gemini
  const tempFilePath = path.join(os.tmpdir(), `segment-${Date.now()}.mp3`);
  let uploadResult: any = null;
  // Reduced to 45s to safely fit within Vercel's 60s execution limit (allowing for overhead)
  const SEGMENT_DURATION = 45; 

  try {
    console.log(`[Transcribe] Processing Segment starting at ${currentTime}s`);

    // 2. USE FFMPEG TO CREATE A VALID AUDIO SEGMENT
    // Optimized for Speed & Size: 16khz Mono @ 32kbps
    await new Promise((resolve, reject) => {
        ffmpeg()
            .input(downloadUrl)
            .inputOptions([
                `-ss ${currentTime}`,
                '-reconnect 1',
                '-reconnect_streamed 1',
                '-reconnect_delay_max 5'
            ])
            .outputOptions([
                `-t ${SEGMENT_DURATION}`, 
                '-ac 1',             // Downmix to Mono
                '-ar 16000',         // 16kHz
                '-map_metadata -1',  
                '-f mp3'
            ])
            .audioCodec('libmp3lame')
            .audioBitrate(32)        
            .on('end', resolve)
            .on('error', (err: any) => {
                console.error('FFmpeg Error:', err);
                reject(new Error(`FFmpeg failed: ${err.message}`));
            })
            .save(tempFilePath);
    });

    // Verify file creation
    if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
        throw new Error("FFmpeg produced an empty file");
    }

    const fileSize = fs.statSync(tempFilePath).size / 1024;
    console.log(`[Transcribe] Segment prepared: ${fileSize.toFixed(2)}KB`);

    // 3. Upload to Google
    uploadResult = await ai.files.upload({
        file: tempFilePath,
        config: {
            mimeType: 'audio/mp3', 
            displayName: "Audio Segment",
        }
    });

    // 4. Poll Processing
    let file = await ai.files.get({ name: uploadResult.name });
    let attempts = 0;
    while (file.state === 'PROCESSING' && attempts < 30) {
        await sleep(1000);
        file = await ai.files.get({ name: uploadResult.name });
        attempts++;
    }

    if (file.state === 'FAILED') {
        throw new Error("Google AI File Processing Failed");
    }

    // 5. Generate Stream
    const modelName = 'gemini-2.5-flash';
    
    // Prompt engineered for granular "Karaoke" style segments
    const systemPrompt = `You are a professional audiobook transcriber.
    
    Task: Transcribe the provided ${Math.floor(SEGMENT_DURATION)} second audio segment verbatim.
    
    CRITICAL RULES:
    1. GRANULARITY: Split text into SHORT phrases or half-sentences (approx 5-15 words). 
       - NEVER output long paragraphs. 
       - The goal is precise karaoke synchronization.
       - Example:
         {"start": "00:00", "end": "00:02", "text": "He walked down the street,"}
         {"start": "00:02", "end": "00:04", "text": "looking at the lights."}
    2. TIMESTAMPS: Use relative timestamps starting at 00:00:00.
    3. ANTI-HALLUCINATION: If audio is silent/noise, output NOTHING.
    4. Output Format: strictly JSONL. {"start": "HH:MM:SS.mmm", "end": "HH:MM:SS.mmm", "speaker": "Name", "text": "..."}
    5. No markdown.
    `;

    const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents: [
            {
                role: 'user',
                parts: [
                    { text: systemPrompt },
                    { 
                       fileData: { 
                           mimeType: file.mimeType, 
                           fileUri: file.uri 
                       } 
                    }
                ]
            }
        ],
        config: {
            temperature: 0, 
        }
    });

    // Send Headers
    res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Content-Type-Options': 'nosniff'
    });

    for await (const chunk of responseStream) {
        res.write(chunk.text);
    }

  } catch (error: any) {
    console.error('[Transcribe Error]', error);
    if (!res.headersSent) {
        return res.status(500).json({ error: error.message || 'Processing Failed', stage: 'processing' });
    } else {
        res.write(`\nERROR: ${error.message}\n`);
    }
  } finally {
    // 6. Cleanup
    if (fs.existsSync(tempFilePath)) {
       try { fs.unlinkSync(tempFilePath); } catch (e) { console.error("Temp delete failed", e); }
    }
    if (uploadResult && uploadResult.name) {
        try {
            await ai.files.delete({ name: uploadResult.name });
        } catch (e) {
            console.error("Remote delete failed", e);
        }
    }
    if (!res.writableEnded) {
        res.end();
    }
  }
}
