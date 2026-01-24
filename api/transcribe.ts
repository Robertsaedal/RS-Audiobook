
import { GoogleGenAI } from "@google/genai";

export const config = {
  maxDuration: 300,
};

// 25MB Chunk Limit (~1 hour at 64kbps) to prevent Vercel Memory/Timeout errors
const CHUNK_SIZE_BYTES = 25 * 1024 * 1024; 

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

  const { downloadUrl, duration, currentTime = 0 } = req.body;
  if (!downloadUrl) {
    return res.status(400).json({ error: 'Missing downloadUrl' });
  }

  let uploadedFileVal: any = null;
  let fileUri: string = "";

  try {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Connection': 'keep-alive',
      'X-Content-Type-Options': 'nosniff'
    });

    res.write("WEBVTT\n\n");
    res.write("NOTE Status: analyzing file size...\n\n");

    // 1. Analyze File Size via HEAD
    let totalBytes = 0;
    try {
        const headRes = await fetch(downloadUrl, { method: 'HEAD' });
        const cl = headRes.headers.get('content-length');
        if (cl) totalBytes = parseInt(cl, 10);
    } catch (e) {
        console.warn("HEAD request failed, defaulting to stream start");
    }

    // 2. Calculate Byte Range
    let startByte = 0;
    let endByte = ''; 
    let isPartial = false;

    if (totalBytes > CHUNK_SIZE_BYTES) {
        isPartial = true;
        const safeDuration = duration || 1;
        const ratio = Math.min(Math.max(currentTime / safeDuration, 0), 1);
        
        const estimatedStartByte = Math.floor(totalBytes * ratio);
        
        if (estimatedStartByte < CHUNK_SIZE_BYTES) {
            startByte = 0;
        } else {
            // Buffer back 1MB to ensure context
            startByte = Math.max(0, estimatedStartByte - (1 * 1024 * 1024));
        }

        const calculatedEnd = Math.min(startByte + CHUNK_SIZE_BYTES, totalBytes);
        endByte = calculatedEnd.toString();
        
        res.write(`NOTE Status: Large file detected (${(totalBytes/1024/1024).toFixed(0)}MB). Downloading byte range ${startByte}-${endByte}...\n\n`);
    } else {
        res.write(`NOTE Status: Processing full file...\n\n`);
    }

    // 3. Fetch Audio Stream with Range Headers
    const headers: any = {};
    if (isPartial) {
        headers['Range'] = `bytes=${startByte}-${endByte}`;
    }

    res.write("NOTE Status: Downloading segment...\n\n");
    const audioResponse = await fetch(downloadUrl, { headers });
    
    if (!audioResponse.ok && audioResponse.status !== 206) {
        throw new Error(`Download failed: ${audioResponse.status} ${audioResponse.statusText}`);
    }
    
    const chunkLength = audioResponse.headers.get('content-length');
    const mimeType = audioResponse.headers.get('content-type') || 'audio/mp3';

    // 4. Init Gemini Resumable Upload
    res.write("NOTE Status: Uplinking to Gemini...\n\n");
    const uploadBaseUrl = "https://generativelanguage.googleapis.com/upload/v1beta/files";
    const startRes = await fetch(`${uploadBaseUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': chunkLength || '',
            'X-Goog-Upload-Header-Content-Type': mimeType,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ file: { display_name: 'Streamed Segment' } })
    });

    if (!startRes.ok) throw new Error(`Gemini Init Failed: ${startRes.status}`);
    const uploadUrl = startRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error("No upload URL received");

    // 5. Stream Data to Gemini
    const uploadHeaders: any = {
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0'
    };
    if (chunkLength) uploadHeaders['Content-Length'] = chunkLength;

    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: uploadHeaders,
        body: audioResponse.body,
        // @ts-ignore
        duplex: 'half' 
    });

    if (!uploadRes.ok) throw new Error(`Gemini Upload Failed: ${uploadRes.status}`);
    
    const uploadData = await uploadRes.json();
    uploadedFileVal = uploadData.file;
    fileUri = uploadData.file.uri;

    // 6. Generate Transcript
    res.write("NOTE Status: Transcribing segment...\n\n");
    
    const ai = new GoogleGenAI({ apiKey: apiKey });

    // Simplified Prompt: We handle time offsets in the frontend now.
    const promptText = `
    This audio is a segment of a larger book. 
    Transcribe it into WebVTT format.
    Do NOT include the 'WEBVTT' header.
    Start timestamps at 00:00:00.000.
    Start directly with the first cue.
    `;

    const response = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash', 
      contents: {
        parts: [
          {
            fileData: {
              mimeType: uploadData.file.mimeType,
              fileUri: fileUri
            }
          },
          { text: promptText }
        ]
      }
    });

    for await (const chunk of response) {
        const text = chunk.text;
        if (text) res.write(text);
    }

  } catch (error: any) {
    console.error('[API Error]', error);
    if (!res.writableEnded) {
        res.write(`\nNOTE Error: ${error.message || 'Processing Failed'}\n`);
    }
  } finally {
    if (uploadedFileVal && uploadedFileVal.name) {
        try {
            await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploadedFileVal.name}?key=${apiKey}`, {
                method: 'DELETE'
            });
        } catch (e) { console.warn("Cleanup failed", e); }
    }
    res.end();
  }
}
