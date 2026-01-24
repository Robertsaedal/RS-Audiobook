
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';

// Vercel Serverless Config
export const config = {
  maxDuration: 300, // 5 minutes
};

// Helper to save URL to temp file
async function downloadFile(url: string, destPath: string) {
  const response = await fetch(url);
  if (!response.ok) { 
      throw new Error(`Failed to download audio: ${response.statusText}`);
  }
  if (!response.body) throw new Error("No response body");
  
  const fileStream = fs.createWriteStream(destPath);
  // @ts-ignore
  await pipeline(response.body, fileStream);
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: Missing GEMINI_API_KEY' });
  }

  const { downloadUrl, duration } = req.body;
  if (!downloadUrl) {
    return res.status(400).json({ error: 'Missing downloadUrl' });
  }

  // Generate a random temp filename
  const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);
  let fileUri = '';
  let fileName = '';

  try {
    // 2. Download Audio
    console.log('[API] Downloading file...');
    await downloadFile(downloadUrl, tempFilePath);

    // 3. Initialize Gemini
    const fileManager = new GoogleAIFileManager(apiKey);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 4. Upload to Gemini
    console.log('[API] Uploading to Gemini File Manager...');
    const uploadResult = await fileManager.uploadFile(tempFilePath, {
      mimeType: "audio/mp3",
      displayName: "Audiobook Segment",
    });
    
    fileUri = uploadResult.file.uri;
    fileName = uploadResult.file.name;

    // OPTIMIZATION: Delete local file immediately after upload to free space
    if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
    }

    // 5. Generate Content Stream
    console.log('[API] Generating Transcript Stream...');
    
    const promptText = `The total duration of this audio is ${duration || 'unknown'} seconds. 
    Transcribe the audio into WebVTT format, including precise timestamp cues. 
    Output ONLY the WEBVTT content. No markdown, no notes. Start directly with WEBVTT.
    Please ensure the WebVTT timestamps reflect this total length.`;

    const result = await model.generateContentStream([
      {
        fileData: {
          mimeType: uploadResult.file.mimeType,
          fileUri: fileUri
        }
      },
      { text: promptText }
    ]);

    // Set streaming headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        res.write(chunkText);
    }
    
    // Cleanup Gemini File (Best Effort)
    try {
       await fileManager.deleteFile(fileName);
    } catch (cleanupErr) {
      console.warn("Gemini Cleanup warning:", cleanupErr);
    }

    res.end();

  } catch (error: any) {
    console.error('[API Error]', error);
    // Ensure temp file is deleted on error
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch(e) {}
    }
    
    // If headers haven't been sent, send JSON error. 
    // If streaming started, the stream will just end abruptly (client handles).
    if (!res.headersSent) {
        return res.status(500).json({ 
            error: error.message || 'Transcription processing failed' 
        });
    } else {
        res.end();
    }
  }
}
