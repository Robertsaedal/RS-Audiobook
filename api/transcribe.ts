
import { GoogleGenAI } from "@google/genai";
import { PassThrough } from 'stream';

export const config = {
  maxDuration: 60, // Standard Vercel Timeout (can be increased on Pro)
  api: {
    bodyParser: true, // We need body parsing for the initial JSON payload
  },
};

// 25MB Chunk Limit to keep execution time safely within Vercel limits
const CHUNK_SIZE_BYTES = 25 * 1024 * 1024; 

/**
 * A Resilient Stream that automatically resumes downloads if the source connection drops.
 * It presents a continuous Readable stream to the consumer (Google Upload).
 */
class ResilientDownloadStream extends PassThrough {
  private url: string;
  private rangeStart: number;
  private rangeEnd: string;
  private totalBytesReceived: number = 0;
  private maxRetries: number = 5;
  private retryCount: number = 0;
  private activeRequestController: AbortController | null = null;
  private expectedLength: number = 0;

  constructor(url: string, start: number, end: string) {
    super();
    this.url = url;
    this.rangeStart = start;
    this.rangeEnd = end;
    
    // Calculate how many bytes we actually expect to pull
    if (this.rangeEnd) {
        this.expectedLength = (parseInt(this.rangeEnd) - this.rangeStart) + 1;
    }

    this.startStream();
  }

  private async startStream() {
    try {
      const currentStart = this.rangeStart + this.totalBytesReceived;
      
      // Stop if we've fulfilled the range
      if (this.rangeEnd && currentStart > parseInt(this.rangeEnd)) {
        (this as any).end();
        return;
      }

      console.log(`[Stream] Requesting Range: bytes=${currentStart}-${this.rangeEnd}`);
      
      this.activeRequestController = new AbortController();
      
      // Range header: inclusive. bytes=0-499 requests the first 500 bytes.
      const response = await fetch(this.url, {
        headers: this.rangeEnd ? { 'Range': `bytes=${currentStart}-${this.rangeEnd}` } : {},
        signal: this.activeRequestController.signal
      });

      if (!response.ok && response.status !== 206) {
        const errText = await response.text();
        throw new Error(`Source returned ${response.status}: ${errText.substring(0, 100)}`);
      }

      if (!response.body) throw new Error("No response body");

      // @ts-ignore - Node.js fetch body is an async iterator
      for await (const chunk of response.body) {
        // Ensure we don't push more than expected if range was set
        let chunkToPush = chunk;
        if (this.expectedLength > 0 && (this.totalBytesReceived + chunk.length) > this.expectedLength) {
            const allowed = this.expectedLength - this.totalBytesReceived;
            chunkToPush = chunk.slice(0, allowed);
        }

        this.totalBytesReceived += chunkToPush.length;
        const canContinue = (this as any).write(new Uint8Array(chunkToPush));
        
        if (this.expectedLength > 0 && this.totalBytesReceived >= this.expectedLength) {
            (this as any).end();
            if (this.activeRequestController) this.activeRequestController.abort();
            return;
        }

        if (!canContinue) {
          await new Promise(resolve => (this as any).once('drain', resolve));
        }
      }

      (this as any).end(); 

    } catch (error: any) {
      if (error.name === 'AbortError') return; // Expected termination

      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.warn(`[Stream] Connection lost. Retrying (${this.retryCount}/${this.maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount)); 
        this.startStream();
      } else {
        console.error("[Stream] Max retries reached.");
        (this as any).emit('error', error);
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
  // CORS Setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server misconfiguration: Missing API Key' });

  const { downloadUrl, duration, currentTime = 0 } = req.body;
  if (!downloadUrl) return res.status(400).json({ error: 'Missing downloadUrl' });

  let uploadedFileName = '';

  try {
    let totalBytes = 0;
    try {
        const headRes = await fetch(downloadUrl, { method: 'HEAD' });
        const cl = headRes.headers.get('content-length');
        if (cl) totalBytes = parseInt(cl, 10);
    } catch (e) {
        console.warn("[Transcribe] HEAD request failed, assuming stream");
    }

    let startByte = 0;
    let endByteStr = ''; 
    let uploadLength = 0;
    
    if (totalBytes > CHUNK_SIZE_BYTES) {
        const ratio = Math.min(Math.max(currentTime / (duration || 1), 0), 1);
        const estimatedStart = Math.floor(totalBytes * ratio);
        
        // Context Buffer: 1MB back
        startByte = Math.max(0, estimatedStart - (1024 * 1024)); 
        
        // Inclusive end byte. 25MB chunk
        const calculatedEnd = Math.min(startByte + CHUNK_SIZE_BYTES - 1, totalBytes - 1);
        endByteStr = calculatedEnd.toString();
        
        // Total bytes to upload
        uploadLength = (calculatedEnd - startByte) + 1;
    } else {
        uploadLength = totalBytes;
    }

    const uploadBaseUrl = "https://generativelanguage.googleapis.com/upload/v1beta/files";
    
    // Resumable upload start
    const initRes = await fetch(`${uploadBaseUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': uploadLength > 0 ? uploadLength.toString() : '',
            // Use application/octet-stream for maximum compatibility across different audio formats
            'X-Goog-Upload-Header-Content-Type': 'application/octet-stream',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ file: { display_name: `Transcribe_${Date.now()}.mp3` } })
    });

    if (!initRes.ok) {
        const initErr = await initRes.text();
        throw new Error(`Gemini Upload Init Failed: ${initRes.status} - ${initErr}`);
    }
    
    const uploadUrl = initRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error("No upload URL returned from Google");

    // Start piping source -> Google
    const sourceStream = new ResilientDownloadStream(downloadUrl, startByte, endByteStr);
    
    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Command': 'upload, finalize',
            'X-Goog-Upload-Offset': '0'
        },
        // @ts-ignore
        body: sourceStream, 
        duplex: 'half'
    });

    if (!uploadRes.ok) {
        const uploadErr = await uploadRes.text();
        throw new Error(`Gemini Stream Upload Failed: ${uploadRes.status} - ${uploadErr.substring(0, 150)}`);
    }
    
    const uploadData = await uploadRes.json();
    uploadedFileName = uploadData.file.name;
    const fileUri = uploadData.file.uri;

    // Start response stream to client
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff'
    });

    const ai = new GoogleGenAI({ apiKey });
    let isReady = false;
    let attempts = 0;

    // Wait for Gemini processing
    while (!isReady && attempts < 60) {
        const file = await ai.files.get({ name: uploadedFileName });
        
        if (file.state === 'ACTIVE') {
            isReady = true;
        } else if (file.state === 'FAILED') {
            throw new Error('Google File Processing Failed');
        } else {
            res.write(': processing...\n'); 
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }
    }

    if (!isReady) throw new Error("Processing Timeout");

    const promptText = `
    You are a high-precision transcription engine. 
    Transcribe the provided audio carefully.
    
    OUTPUT FORMAT REQUIREMENTS:
    1. Output ONLY valid JSON objects, one per line (JSONL).
    2. Do NOT use markdown code blocks.
    3. Identify speakers as "Speaker A", "Speaker B", or "Narrator".
    4. Note background sounds in the "background_noise" field.

    JSON SCHEMA (Per Line):
    {"start": "HH:MM:SS.mmm", "end": "HH:MM:SS.mmm", "speaker": "Name", "text": "...", "background_noise": "..."}
    `;

    const response = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { fileData: { mimeType: 'audio/mp3', fileUri: fileUri } },
          { text: promptText }
        ]
      }
    });

    for await (const chunk of response) {
        const text = chunk.text;
        if (text) res.write(text);
    }

  } catch (error: any) {
    console.error('[Transcribe Error]', error);
    if (res.headersSent) {
        res.write(`\nERROR: ${error.message}`);
    } else {
        res.status(500).json({ error: error.message });
    }
  } finally {
    if (uploadedFileName) {
        try {
            await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploadedFileName}?key=${apiKey}`, {
                method: 'DELETE'
            });
        } catch (e) { }
    }
    res.end();
  }
}
