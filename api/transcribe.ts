
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PassThrough } from 'stream';

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: true,
  },
};

// CRITICAL: Reduced to 1MB (approx 1 minute of audio) to prevent Vercel 504 Timeout errors.
// Serverless functions often time out after 10s on Hobby plans. 
// Small chunks ensure the download+upload+transcribe cycle finishes fast.
const CHUNK_SIZE_BYTES = 1024 * 1024; 

class ResilientDownloadStream extends PassThrough {
  private url: string;
  private rangeStart: number;
  private rangeEnd: string;
  private totalBytesReceived: number = 0;
  private maxRetries: number = 3; // Reduced retries to fail fast
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

      // console.log(`[Stream] Requesting Range: bytes=${currentStart}-${this.rangeEnd}`);
      
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
        // console.warn(`[Stream] Retry ${this.retryCount}/${this.maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 500 * this.retryCount));
        this.startStream();
      } else {
        // console.error("[Stream] Max retries reached.");
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
    // 1. Analyze File Size (Timeout-bounded)
    let totalBytes = 0;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout for HEAD
        const headRes = await fetch(downloadUrl, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeoutId);
        const cl = headRes.headers.get('content-length');
        if (cl) totalBytes = parseInt(cl, 10);
    } catch (e) {
        // console.warn("[Transcribe] HEAD failed, assuming stream");
    }

    // 2. Smart Chunking
    let startByte = 0;
    let endByteStr = ''; 
    let uploadSize = 0;
    
    // Default to downloading 1MB chunk if totalBytes unknown or large
    if (totalBytes === 0 || totalBytes > CHUNK_SIZE_BYTES) {
        const ratio = Math.min(Math.max(currentTime / (duration || 1), 0), 1);
        const estimatedStart = totalBytes > 0 ? Math.floor(totalBytes * ratio) : 0; // Fallback 0 if unknown
        
        // 128KB context buffer (approx 8s)
        startByte = Math.max(0, estimatedStart - (128 * 1024)); 
        
        // If totalBytes is unknown (0), we just request a range and hope server supports it 
        // or we rely on the stream ending. But for uploads we usually need size.
        // We assume 1MB chunk.
        const calculatedEnd = startByte + CHUNK_SIZE_BYTES;
        if (totalBytes > 0) {
             endByteStr = Math.min(calculatedEnd, totalBytes).toString();
             uploadSize = parseInt(endByteStr) - startByte;
        } else {
             // Blind chunk
             endByteStr = calculatedEnd.toString();
             uploadSize = CHUNK_SIZE_BYTES; 
        }
    } else {
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
    // Start response early to prevent Gateway Timeout while waiting for Google
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'Connection': 'keep-alive'
    });

    let isReady = false;
    let attempts = 0;

    // Wait max 10 seconds for file processing
    while (!isReady && attempts < 20) {
        const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploadedFileName}?key=${apiKey}`);
        const pollData = await pollRes.json();
        
        if (pollData.state === 'ACTIVE') {
            isReady = true;
        } else if (pollData.state === 'FAILED') {
            throw new Error('Google File Processing Failed');
        } else {
            res.write(': processing...\n'); 
            await new Promise(r => setTimeout(r, 500)); 
            attempts++;
        }
    }

    if (!isReady) throw new Error("File Processing Timeout");

    // 6. Generate Content (SDK)
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const promptText = `
    Transcribe audio.
    1. Speaker Diarization (Speaker 1, etc).
    2. [Noise] in brackets.
    3. Output strictly JSONL.
    
    Schema: {"start": "HH:MM:SS.mmm", "end": "HH:MM:SS.mmm", "speaker": "Name", "text": "Text", "background_noise": "Desc"}
    `;

    const result = await model.generateContentStream([
        { fileData: { mimeType: "audio/mp3", fileUri: fileUri } },
        { text: promptText }
    ]);

    for await (const chunk of result.stream) {
        const text = chunk.text();
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
        // Fire and forget delete
        fetch(`https://generativelanguage.googleapis.com/v1beta/${uploadedFileName}?key=${apiKey}`, {
            method: 'DELETE'
        }).catch(() => {});
    }
    res.end();
  }
}
