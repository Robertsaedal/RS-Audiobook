
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from './db';
import { ABSService } from './absService';

export interface VttCue {
  start: number;
  end: number;
  text: string;
}

export class TranscriptionService {
  private static apiKey = process.env.GEMINI_API_KEY;

  static async getTranscript(itemId: string): Promise<string | null> {
    const record = await db.transcripts.get(itemId);
    return record ? record.vttContent : null;
  }

  static async generateTranscript(
    absService: ABSService, 
    itemId: string, 
    downloadUrl: string
  ): Promise<string> {
    if (!this.apiKey) {
      console.error('Missing Gemini API Key in .env file');
      throw new Error("Gemini API Key missing. Service disabled.");
    }

    // 1. Fetch Audio Blob (Proxy through ABSService to handle auth headers)
    console.log('[Transcription] Fetching audio for analysis...');
    const audioBlob = await absService.downloadFile(downloadUrl);
    
    // 2. Convert to Base64 for Gemini Inline Data
    const base64Audio = await this.blobToBase64(audioBlob);

    // 3. Init Gemini (Using @google/generative-ai SDK)
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    
    // 4. Generate Content
    console.log('[Transcription] Sending to Gemini 2.0 Flash...');
    
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: audioBlob.type || 'audio/mp3',
          data: base64Audio
        }
      },
      `Transcribe the audio into WebVTT format, including precise timestamp cues (HH:MM:SS.mmm). 
       Ensure speaker labels are included if discernible. 
       Return ONLY the complete WebVTT content, with no introductory text, markdown formatting, or explanations. 
       Start directly with WEBVTT.`
    ]);

    const response = await result.response;
    const vttText = response.text();

    if (!vttText.startsWith('WEBVTT')) {
       // Fallback cleanup if model chatters
       const match = vttText.match(/WEBVTT[\s\S]*/);
       if (match) return this.saveTranscript(itemId, match[0]);
       throw new Error("Invalid VTT format received from model.");
    }

    return this.saveTranscript(itemId, vttText);
  }

  private static async saveTranscript(itemId: string, vttContent: string): Promise<string> {
    await db.transcripts.put({
      itemId,
      vttContent,
      createdAt: Date.now()
    });
    return vttContent;
  }

  static parseVTT(vttString: string): VttCue[] {
    const lines = vttString.split(/\r?\n/);
    const cues: VttCue[] = [];
    let currentStart: number | null = null;
    let currentEnd: number | null = null;
    let currentText = '';

    const timeRegex = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/;

    const parseTime = (timeStr: string) => {
      const [h, m, s] = timeStr.split(':');
      const [sec, ms] = s.split('.');
      return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec) + parseInt(ms) / 1000;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line === 'WEBVTT') continue;

      const timeMatch = line.match(timeRegex);
      if (timeMatch) {
        if (currentStart !== null && currentText) {
          cues.push({ start: currentStart, end: currentEnd!, text: currentText.trim() });
        }
        currentStart = parseTime(timeMatch[1]);
        currentEnd = parseTime(timeMatch[2]);
        currentText = '';
      } else if (currentStart !== null) {
        currentText += (currentText ? '\n' : '') + line;
      }
    }
    // Push last cue
    if (currentStart !== null && currentText) {
      cues.push({ start: currentStart, end: currentEnd!, text: currentText.trim() });
    }

    return cues;
  }

  private static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove "data:audio/mp3;base64," prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
