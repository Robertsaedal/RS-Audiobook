
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const config = {
  maxDuration: 300,
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY!;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: Missing GEMINI_API_KEY' });
  }

  const { downloadUrl, duration } = req.body;
  if (!downloadUrl) {
    return res.status(400).json({ error: 'Missing downloadUrl' });
  }

  let tempFilePath: string | null = null;
  let fileUri: string | null = null;
  let fileName: string | null = null;
  
  const fileManager = new GoogleAIFileManager(apiKey);

  try {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Connection': 'keep-alive',
      'X-Content-Type-Options': 'nosniff'
    });

    res.write("WEBVTT\n\n");
    res.write("NOTE Status: Initializing...\n\n");

    // 1. Stream Download to /tmp
    res.write("NOTE Status: Buffering audio to server...\n\n");
    const audioResponse = await fetch(downloadUrl);
    if (!audioResponse.ok) throw new Error(`Download failed: ${audioResponse.statusText}`);
    if (!audioResponse.body) throw new Error("No audio body");

    tempFilePath = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`);
    const fileStream = fs.createWriteStream(tempFilePath);
    
    // @ts-ignore - Readable.fromWeb matches web stream signatures in Node 18+
    await pipeline(Readable.fromWeb(audioResponse.body), fileStream);

    // 2. Upload to Gemini
    res.write("NOTE Status: Uploading to Gemini Cache...\n\n");
    
    const uploadResult = await fileManager.uploadFile(tempFilePath, {
      mimeType: "audio/mp3",
      displayName: "Audiobook Segment"
    });
    
    fileUri = uploadResult.file.uri;
    fileName = uploadResult.file.name;
    
    // 3. Generate
    res.write("NOTE Status: Generating transcript...\n\n");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const promptText = `
    The audio duration is ${duration || 'unknown'} seconds. 
    Transcribe this audio into WebVTT format with precise timestamp cues.
    Do NOT include the 'WEBVTT' header line.
    Start directly with the first cue or a NOTE.
    Ensure timestamps correspond to the full ${duration}s duration.
    `;

    const result = await model.generateContentStream([
      {
        fileData: {
          mimeType: uploadResult.file.mimeType,
          fileUri: fileUri
        }
      },
      { text: promptText }
    ]);

    for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) res.write(text);
    }
    
    res.end();

  } catch (error: any) {
    console.error('[API Error]', error);
    if (!res.writableEnded) {
        res.write(`\nNOTE Error: ${error.message || 'Processing Failed'}\n`);
        res.end();
    }
  } finally {
    // Cleanup Temp File
    if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlink(tempFilePath, (err) => { if(err) console.error("Temp delete failed", err); });
    }
    // Cleanup Gemini File (Best Practice)
    if (fileName) {
        try {
            await fileManager.deleteFile(fileName);
            console.log("Gemini file cleaned up");
        } catch (e) {
            console.warn("Failed to cleanup Gemini file", e);
        }
    }
  }
}
