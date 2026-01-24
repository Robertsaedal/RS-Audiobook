
import { db } from './db';

export interface VttCue {
  start: number;
  end: number;
  text: string;
}

export class TranscriptionService {
  
  static async getTranscript(itemId: string): Promise<string | null> {
    const record = await db.transcripts.get(itemId);
    return record ? record.vttContent : null;
  }

  static async generateTranscript(
    itemId: string, 
    downloadUrl: string,
    duration: number
  ): Promise<string> {
    
    console.log('[Transcription] Requesting server-side processing...');

    try {
      // Call our Vercel Serverless Function
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ downloadUrl, duration })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server Error: ${response.status}`);
      }

      const data = await response.json();
      const vttText = data.vtt;

      if (!vttText || !vttText.includes('WEBVTT')) {
         // Fallback loose check
         if (vttText && vttText.includes('WEBVTT')) {
             return this.saveTranscript(itemId, vttText);
         }
         throw new Error("Invalid VTT format received from server.");
      }

      return this.saveTranscript(itemId, vttText);

    } catch (error: any) {
      console.error("Transcription Service Error:", error);
      throw error;
    }
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
      const parts = timeStr.split(':');
      let h = 0, m = 0, s = 0, ms = 0;
      
      if (parts.length === 3) {
        h = parseInt(parts[0]);
        m = parseInt(parts[1]);
        const secParts = parts[2].split('.');
        s = parseInt(secParts[0]);
        ms = parseInt(secParts[1]);
      } else if (parts.length === 2) {
        m = parseInt(parts[0]);
        const secParts = parts[1].split('.');
        s = parseInt(secParts[0]);
        ms = parseInt(secParts[1]);
      }

      return h * 3600 + m * 60 + s + ms / 1000;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line === 'WEBVTT' || line.startsWith('NOTE')) continue;

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
}
