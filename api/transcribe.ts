
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PassThrough } from 'stream';

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: true,
  },
};

const CHUNK_SIZE_BYTES = 25 * 1024 * 1024; 

class ResilientDownloadStream extends PassThrough {
  private url: string;
  private rangeStart: number;
  private rangeEnd: string;
  private totalBytesReceived: number = 0;
  private maxRetries: number = 5;
  private retryCount: number = 0;
  private activeRequestController: AbortController | null = null;

  constructor(url: string, start: number, end: string) {
    super();
    this.url = url;
    this.rangeStart = start;
    this.rangeEnd = end;
    this.startStream();
  }

  private async startStream() {
    try {
      const currentStart = this.rangeStart + this.totalBytesReceived;
      if (this.rangeEnd && currentStart > parseInt(this.rangeEnd)) {
        this.end();
        return;
      }

      console.log(`[Stream] Requesting Range: bytes=${currentStart}-${this.rangeEnd}`);
      
      this.activeRequestController = new AbortController();
      
      const response = await fetch(this.url, {
        headers: { 'Range': `bytes=${currentStart}-${this.rangeEnd}` },
        signal: this.activeRequestController.signal
      });

      if (!response.ok && response.status !== 206) {
        throw new Error(`Source returned ${response.status}`);
      }

      if (!response.body) throw new Error("No response body");

      // @ts-ignore - Node.js fetch body is async iterator
      for await (const chunk of response.body) {
        this.totalBytesReceived += chunk.length;
        const canContinue = this.write(Buffer.from(chunk));
        if (!canContinue) {
          await new Promise(resolve => this.once('drain', resolve));
        }
      }

      this.end(); 

    } catch (error: any) {
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.warn(`[Stream] Retry ${this.retryCount}/${this.maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount));
        this.startStream();
      } else {
        console.error("[Stream] Max retries reached.");
        this.emit('error', error);
      }
    }
  }

  public destroy(error?: Error): this {
    if (this.activeRequestController) {
        this.activeRequestController.abort();
    }
    super.destroy(error);
    return this;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server misconfiguration: Missing API Key' });

  const { downloadUrl, duration, currentTime = 0 } = req.body;
  if (!downloadUrl) return res.status(400).json({ error: 'Missing downloadUrl' });

  let uploadedFileName = '';

  try {
    // 1. Analyze File Size
    let totalBytes = 0;
    try {
        const headRes = await fetch(downloadUrl, { method: 'HEAD' });
        const cl = headRes.headers.get('content-length');
        if (cl) totalBytes = parseInt(cl, 10);
    } catch (e) {
        console.warn("[Transcribe] HEAD failed, assuming stream");
    }

    // 2. Smart Chunking
    let startByte = 0;
    let endByteStr = ''; 
    let uploadSize = 0;
    
    if (totalBytes > CHUNK_SIZE_BYTES) {
        const ratio = Math.min(Math.max(currentTime / (duration || 1), 0), 1);
        const estimatedStart = Math.floor(totalBytes * ratio);
        startByte = Math.max(0, estimatedStart - (1024 * 1024)); 
        const calculatedEnd = Math.min(startByte + CHUNK_SIZE_BYTES, totalBytes);
        endByteStr = calculatedEnd.toString();
        uploadSize = calculatedEnd - startByte;
    } else if (totalBytes > 0) {
        uploadSize = totalBytes;
    }

    // 3. Init Resumable Upload
    const uploadBaseUrl = "https://generativelanguage.googleapis.com/upload/v1beta/files";
    const initRes = await fetch(`${uploadBaseUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': uploadSize > 0 ? uploadSize.toString() : '',
            'X-Goog-Upload-Header-Content-Type': 'audio/mp3',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ file: { display_name: 'Audio Chunk' } })
    });

    if (!initRes.ok) throw new Error(`Gemini Init Failed: ${initRes.status}`);
    const uploadUrl = initRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error("No upload URL returned");

    // 4. Pipe Stream -> Google
    const sourceStream = new ResilientDownloadStream(downloadUrl, startByte, endByteStr);
    
    // Explicit Content-Length is required for robust Vercel streaming
    const uploadHeaders: any = {
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0'
    };
    if (uploadSize > 0) {
        uploadHeaders['Content-Length'] = uploadSize.toString();
    }

    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: uploadHeaders,
        // @ts-ignore
        body: sourceStream, 
        duplex: 'half'
    });

    if (!uploadRes.ok) throw new Error(`Gemini Upload Failed: ${uploadRes.status}`);
    
    const uploadData = await uploadRes.json();
    uploadedFileName = uploadData.file.name;
    const fileUri = uploadData.file.uri;

    // 5. Polling (Heartbeat)
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff'
    });

    // Use REST for polling to avoid complex SDK setup for simple get
    let isReady = false;
    let attempts = 0;

    while (!isReady && attempts < 60) {
        const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploadedFileName}?key=${apiKey}`);
        const pollData = await pollRes.json();
        
        if (pollData.state === 'ACTIVE') {
            isReady = true;
        } else if (pollData.state === 'FAILED') {
            throw new Error('Google File Processing Failed');
        } else {
            res.write(': processing...\n'); 
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }
    }

    if (!isReady) throw new Error("Processing Timeout");

    // 6. Generate Content (SDK)
    const genAI = new GoogleGenerativeAI(apiKey);
    // Stable model ID
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const promptText = `
    Transcribe this audio with high precision.
    1. **Speaker Diarization**: Identify speakers (e.g., "Speaker 1", "Narrator").
    2. **Background Noise**: Briefly describe significant sounds in brackets (e.g., "[Music fades]").
    3. **JSONL Output**: Return valid JSONL. No markdown.
    
    Schema: {"start": "HH:MM:SS.mmm", "end": "HH:MM:SS.mmm", "speaker": "Name", "text": "Spoken text", "background_noise": "Optional"}
    `;

    const result = await model.generateContentStream([
        { fileData: { mimeType: "audio/mp3", fileUri: fileUri } },
        { text: promptText }
    ]);

    for await (const chunk of result.stream) {
        const text = chunk.text(); // Method, not property
        if (text) res.write(text);
    }

  } catch (error: any) {
    console.error('[Transcribe Error]', error);
    if (!res.headersSent) {
        res.status(500).json({ error: error.message });
    } else {
        res.write(`\nERROR: ${error.message}`);
    }
  } finally {
    if (uploadedFileName) {
        try {
            await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploadedFileName}?key=${apiKey}`, {
                method: 'DELETE'
            });
        } catch (e) { /* ignore */ }
    }
    res.end();
  }
}
