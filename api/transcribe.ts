
import { GoogleGenerativeAI } from "@google/generative-ai";

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

  let uploadedFileVal: any = null;

  try {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Connection': 'keep-alive',
      'X-Content-Type-Options': 'nosniff'
    });

    res.write("WEBVTT\n\n");
    res.write("NOTE Status: Initializing connection...\n\n");

    // 1. Fetch Audio Stream
    res.write("NOTE Status: Connecting to Audio Source...\n\n");
    const audioResponse = await fetch(downloadUrl);
    if (!audioResponse.ok) throw new Error(`Download failed: ${audioResponse.statusText}`);
    
    const contentLength = audioResponse.headers.get('content-length');
    const mimeType = audioResponse.headers.get('content-type') || 'audio/mp3';

    // 2. Init Gemini Resumable Upload
    // We use the raw REST API to pipe the stream directly, avoiding local disk usage.
    res.write("NOTE Status: Establishing Gemini Uplink...\n\n");
    const baseUrl = "https://generativelanguage.googleapis.com/upload/v1beta/files";
    const startRes = await fetch(`${baseUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': contentLength || '',
            'X-Goog-Upload-Header-Content-Type': mimeType,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ file: { display_name: 'Streamed Audio' } })
    });

    if (!startRes.ok) {
        const errText = await startRes.text();
        throw new Error(`Gemini Upload Init Failed: ${startRes.status} - ${errText}`);
    }
    
    const uploadUrl = startRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error("No upload URL received from Gemini");

    // 3. Stream Data directly to Gemini
    res.write("NOTE Status: Streaming Audio to Cloud...\n\n");
    
    const uploadHeaders: any = {
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0'
    };
    if (contentLength) {
        uploadHeaders['Content-Length'] = contentLength;
    }

    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: uploadHeaders,
        body: audioResponse.body,
        // @ts-ignore - Required for Node.js fetch streaming to work efficiently
        duplex: 'half' 
    });

    if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Gemini Stream Upload Failed: ${uploadRes.status} - ${errText}`);
    }
    
    const uploadData = await uploadRes.json();
    uploadedFileVal = uploadData.file;
    const fileUri = uploadData.file.uri;

    // 4. Generate Transcript
    res.write("NOTE Status: Transcribing...\n\n");
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
          mimeType: uploadData.file.mimeType,
          fileUri: fileUri
        }
      },
      { text: promptText }
    ]);

    for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) res.write(text);
    }

  } catch (error: any) {
    console.error('[API Error]', error);
    if (!res.writableEnded) {
        res.write(`\nNOTE Error: ${error.message || 'Processing Failed'}\n`);
    }
  } finally {
    // Cleanup Gemini File
    if (uploadedFileVal && uploadedFileVal.name) {
        try {
            await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploadedFileVal.name}?key=${apiKey}`, {
                method: 'DELETE'
            });
            console.log(`[API] Cleaned up Gemini file: ${uploadedFileVal.name}`);
        } catch (e) {
            console.warn("[API] Failed to cleanup Gemini file", e);
        }
    }
    res.end();
  }
}
