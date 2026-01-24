
import { GoogleGenerativeAI } from "@google/generative-ai";

// Vercel Serverless Config
export const config = {
  maxDuration: 300, // 5 minutes
};

export default async function handler(req: any, res: any) {
  // CORS Headers
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

  // 1. Validation
  const apiKey = process.env.GEMINI_API_KEY!;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: Missing GEMINI_API_KEY' });
  }

  const { downloadUrl, duration } = req.body;
  if (!downloadUrl) {
    return res.status(400).json({ error: 'Missing downloadUrl' });
  }

  try {
    // 2. IMMEDIATE RESPONSE (Fixes 524 Timeout)
    // We send headers and the VTT header immediately so Cloudflare sees activity.
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Connection': 'keep-alive',
      'X-Content-Type-Options': 'nosniff'
    });

    res.write("WEBVTT\n\n");
    res.write("NOTE Status: Initializing connection...\n\n");

    // 3. Download Audio (Streamed Status)
    res.write("NOTE Status: Downloading audio file...\n\n");
    
    // Fetch audio
    const audioResponse = await fetch(downloadUrl);
    if (!audioResponse.ok) {
       throw new Error(`Audio download failed: ${audioResponse.statusText}`);
    }

    const arrayBuffer = await audioResponse.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');
    
    res.write("NOTE Status: Audio processed. Asking Gemini...\n\n");

    // 4. Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const promptText = `
    The audio duration is ${duration || 'unknown'} seconds. 
    Transcribe this audio into WebVTT format with precise timestamp cues.
    Do NOT include the 'WEBVTT' header line, as I have already written it.
    Start directly with the first cue or a NOTE.
    Ensure timestamps correspond to the full ${duration}s duration.
    `;

    // 5. Generate Stream
    const result = await model.generateContentStream([
      {
        inlineData: {
          mimeType: "audio/mp3",
          data: base64Audio
        }
      },
      { text: promptText }
    ]);

    for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
            res.write(chunkText);
        }
    }
    
    res.end();

  } catch (error: any) {
    console.error('[API Error]', error);
    // Since headers are already sent, we must write the error to the stream
    // The frontend parser ignores lines starting with NOTE, but we can display them if needed.
    // We attempt to close the stream gracefully with an error note.
    if (!res.writableEnded) {
        res.write(`\nNOTE Error: ${error.message || 'Processing Failed'}\n`);
        res.end();
    }
  }
}
