
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

  try {
    console.log(`[Transcribe] Processing Segment starting at ${currentTime}s`);

    // 2. USE FFMPEG TO CREATE A VALID AUDIO SEGMENT
    // This fixes the "missing header" issue by re-encoding a slice of the audio
    // into a standalone MP3 file with valid headers.
    await new Promise((resolve, reject) => {
        ffmpeg(downloadUrl)
            .setStartTime(currentTime)
            .setDuration(300) // Transcribe 5 minutes of context
            .audioCodec('libmp3lame')
            .audioBitrate(128)
            .format('mp3')
            .on('end', resolve)
            .on('error', (err) => {
                console.error('FFmpeg Error:', err);
                reject(new Error(`FFmpeg failed: ${err.message}`));
            })
            .save(tempFilePath);
    });

    // Verify file creation
    if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
        throw new Error("FFmpeg produced an empty file");
    }

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
    
    // Updated Prompt to handle "Chapter at a time" flow nicely
    const systemPrompt = `You are a professional audiobook transcriber.
    
    Task: Transcribe the provided 5-minute audio segment accurately.
    
    CRITICAL RULES:
    1. STRICT ANTI-HALLUCINATION: If the audio is silent, noise, music, or unintelligible, OUTPUT NOTHING.
    2. Context: This is a segment from a Fantasy Audiobook. Expect dialogue, narrative, and fantasy terminology.
    3. Output Format: strictly JSONL. {"start": "HH:MM:SS.mmm", "end": "HH:MM:SS.mmm", "speaker": "Name", "text": "..."}
    4. Do not output markdown. Do not output generic "Visuals" or "Intro" tags.
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
