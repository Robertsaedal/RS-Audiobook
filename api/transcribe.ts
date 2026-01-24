
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';

// Helper to save URL to temp file
async function downloadFile(url: string, destPath: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download audio: ${response.statusText}`);
  if (!response.body) throw new Error("No response body");
  
  // Create a writable stream to the temp file
  const fileStream = fs.createWriteStream(destPath);
  
  // @ts-ignore - ReadableStream/Node stream mismatch typing in some envs
  await pipeline(response.body, fileStream);
}

export default async function handler(req: any, res: any) {
  // 1. CORS Headers (Optional if same domain, but good for safety)
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

  const { downloadUrl } = req.body;
  if (!downloadUrl) {
    return res.status(400).json({ error: 'Missing downloadUrl' });
  }

  // Generate a random temp filename
  const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.mp3`);

  try {
    // 2. Download Audio to Temp
    console.log('[API] Downloading audio to temp storage...');
    await downloadFile(downloadUrl, tempFilePath);

    // 3. Initialize Gemini Server Tools
    const fileManager = new GoogleAIFileManager(apiKey);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 4. Upload to Gemini
    console.log('[API] Uploading to Gemini File Manager...');
    const uploadResult = await fileManager.uploadFile(tempFilePath, {
      mimeType: "audio/mp3",
      displayName: "Audiobook Segment",
    });

    console.log(`[API] File uploaded: ${uploadResult.file.uri}`);

    // 5. Generate Content
    // Note: Audio files take a moment to process. 
    // For production, you might need a loop checking getFile state, 
    // but Flash is usually instant for audio.
    console.log('[API] Generating Transcript...');
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResult.file.mimeType,
          fileUri: uploadResult.file.uri
        }
      },
      { text: `Transcribe the audio into WebVTT format, including precise timestamp cues (HH:MM:SS.mmm). 
               Ensure speaker labels are included if discernible. 
               Return ONLY the complete WebVTT content. Start directly with WEBVTT.` }
    ]);

    const vttText = result.response.text();

    // 6. Cleanup (Delete temp file)
    try {
      fs.unlinkSync(tempFilePath);
      // Optional: Delete from Gemini Manager to save quota
      // await fileManager.deleteFile(uploadResult.file.name);
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr);
    }

    return res.status(200).json({ vtt: vttText });

  } catch (error: any) {
    console.error('[API Error]', error);
    
    // Attempt cleanup on error
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return res.status(500).json({ 
      error: error.message || 'Transcription processing failed' 
    });
  }
}
