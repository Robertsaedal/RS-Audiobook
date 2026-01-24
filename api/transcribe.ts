
import { GoogleGenAI } from "@google/genai";

export const config = {
  maxDuration: 300, // 5 min timeout for Vercel Function
};

// 25MB Chunk Limit (~1 hour at 64kbps) to prevent Memory Limits
const CHUNK_SIZE_BYTES = 25 * 1024 * 1024; 

async function fetchWithRetry(url: string, options: any, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      // 200 OK or 206 Partial Content are success states
      if (res.ok || res.status === 206) return res;
      if (res.status === 404) throw new Error("Source file not found (404)");
      // Throw for 5xx or 429 to trigger retry
      if (res.status >= 500 || res.status === 429) throw new Error(`Server Error ${res.status}`);
      // Other 4xx errors shouldn't be retried
      throw new Error(`Client Error ${res.status}`); 
    } catch (e) {
      console.warn(`[Transcribe] Fetch attempt ${i + 1} failed:`, e);
      if (i === retries - 1) throw e;
      // Exponential backoff: 1s, 2s, 4s...
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error("Failed to fetch audio stream after retries");
}

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
    // 1. Analyze File Size via HEAD
    let totalBytes = 0;
    try {
        const headRes = await fetch(downloadUrl, { method: 'HEAD' });
        const cl = headRes.headers.get('content-length');
        if (cl) totalBytes = parseInt(cl, 10);
    } catch (e) {
        console.warn("[Transcribe] HEAD request failed, defaulting to stream start");
    }

    // 2. Calculate Byte Range (Smart Chunking)
    let startByte = 0;
    let endByte = ''; 
    let isPartial = false;

    if (totalBytes > CHUNK_SIZE_BYTES) {
        isPartial = true;
        const safeDuration = duration || 1;
        const ratio = Math.min(Math.max(currentTime / safeDuration, 0), 1);
        
        const estimatedStartByte = Math.floor(totalBytes * ratio);
        
        // Align start byte to avoid cutting mid-frame (approx) and buffer back 1MB for context
        if (estimatedStartByte < CHUNK_SIZE_BYTES) {
            startByte = 0;
        } else {
            startByte = Math.max(0, estimatedStartByte - (1 * 1024 * 1024)); 
        }

        const calculatedEnd = Math.min(startByte + CHUNK_SIZE_BYTES, totalBytes);
        endByte = calculatedEnd.toString();
    }

    // 3. Fetch Audio Stream with Retry & Range Headers
    const headers: any = {};
    if (isPartial) {
        headers['Range'] = `bytes=${startByte}-${endByte}`;
        console.log(`[Transcribe] Requesting Range: ${headers['Range']}`);
    }

    // Use retry logic here to ensure stream is acquired
    const audioResponse = await fetchWithRetry(downloadUrl, { headers });
    
    const chunkLength = audioResponse.headers.get('content-length');
    const mimeType = audioResponse.headers.get('content-type') || 'audio/mp3';

    // 4. Init Gemini Resumable Upload
    // We strictly use the Resumable Upload protocol to pipe the stream
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

    if (!startRes.ok) {
        const errText = await startRes.text();
        if (startRes.status === 429 || errText.includes('429')) {
             return res.status(429).json({ error: 'Gemini API Rate Limit Reached. Please wait.' });
        }
        throw new Error(`Gemini Init Failed: ${startRes.status}`);
    }

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
        // @ts-ignore: Required for Node.js fetch streaming
        duplex: 'half' 
    });

    if (!uploadRes.ok) throw new Error(`Gemini Upload Failed: ${uploadRes.status}`);
    
    const uploadData = await uploadRes.json();
    uploadedFileVal = uploadData.file;
    fileUri = uploadData.file.uri;
    const fileName = uploadData.file.name;

    // 6. POLLING FOR COMPLETION (State: ACTIVE)
    // Audio processing is usually fast, but we must wait for state=ACTIVE
    const fileApiUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`;
    let isReady = false;
    let attempts = 0;
    
    while (!isReady && attempts < 60) { // Poll for up to 60s
        const pollRes = await fetch(fileApiUrl);
        const pollData = await pollRes.json();
        
        if (pollData.state === 'ACTIVE') {
            isReady = true;
        } else if (pollData.state === 'FAILED') {
            throw new Error(`File processing failed: ${pollData.error?.message || 'Unknown error'}`);
        } else {
            // Still PROCESSING, wait 1s
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }
    }
    
    if (!isReady) throw new Error("File processing timed out (State not ACTIVE)");

    // 7. Generate Transcript with Speaker Diarization
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Connection': 'keep-alive',
      'X-Content-Type-Options': 'nosniff'
    });

    const ai = new GoogleGenAI({ apiKey: apiKey });

    // Strict JSONL Prompt
    const promptText = `
    You are an expert audio transcriber. 
    Transcribe the provided audio segment accurately.
    
    Instructions:
    1. Identify different speakers and label them (e.g., "Speaker 1", "Speaker 2", "Narrator").
    2. Output strictly in JSONL (JSON Lines) format.
    3. Do NOT include markdown formatting, code blocks, or explanations.
    4. Each line must be a valid JSON object.
    
    Schema per line:
    {
      "start": "HH:MM:SS.mmm", 
      "end": "HH:MM:SS.mmm", 
      "speaker": "Speaker Name", 
      "text": "The spoken content."
    }
    
    Example Output:
    {"start": "00:00:01.000", "end": "00:00:04.500", "speaker": "Narrator", "text": "It was the best of times."}
    {"start": "00:00:04.500", "end": "00:00:06.000", "speaker": "Speaker 1", "text": "Really?"}
    `;

    const response = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash', // Fast and capable for audio
      contents: {
        parts: [
          {
            fileData: {
              mimeType: uploadedFileVal.mimeType,
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
    console.error('[Transcribe API Error]', error);
    
    if (error.message?.includes('429') || error.status === 429) {
        if (!res.headersSent) {
             return res.status(429).json({ error: 'Too Many Requests' });
        }
    } else {
        if (!res.headersSent) {
             return res.status(500).json({ error: error.message || 'Internal Server Error' });
        }
    }
  } finally {
    // Cleanup: Delete the file from Google's server
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
