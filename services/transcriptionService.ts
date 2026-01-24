
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
    duration: number,
    onChunk?: (chunk: string) => void,
    currentTime: number = 0 
  ): Promise<string> {
    
    console.log('[Transcription] Requesting smart segment transcription...');

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ downloadUrl, duration, currentTime })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server Error: ${response.status}`);
      }

      if (!response.body) throw new Error("No response body available for streaming");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let vttText = '';
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          vttText += chunk;
          if (onChunk) onChunk(chunk);
        }
      }

      if (!vttText || (!vttText.includes('WEBVTT') && vttText.length < 50)) {
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

  static parseVTT(vttString: string, offsetSeconds: number = 0): VttCue[] {
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
        // Apply Offset Here
        currentStart = parseTime(timeMatch[1]) + offsetSeconds;
        currentEnd = parseTime(timeMatch[2]) + offsetSeconds;
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
