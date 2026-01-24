
import { db } from './db';

export interface TranscriptCue {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  background_noise?: string; // New field
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
      let fullText = '';
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          if (onChunk) onChunk(chunk);
        }
      }

      return this.saveTranscript(itemId, fullText);

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

  static parseTranscript(jsonlString: string, offsetSeconds: number = 0): TranscriptCue[] {
    const lines = jsonlString.split(/\r?\n/);
    const cues: TranscriptCue[] = [];

    const parseTime = (timeStr: string) => {
      if (!timeStr) return 0;
      const parts = timeStr.split(':');
      let h = 0, m = 0, s = 0, ms = 0;
      
      if (parts.length === 3) {
        h = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
        const secParts = parts[2].split('.');
        s = parseInt(secParts[0], 10);
        ms = parseInt(secParts[1] || '0', 10);
      } else if (parts.length === 2) {
        m = parseInt(parts[0], 10);
        const secParts = parts[1].split('.');
        s = parseInt(secParts[0], 10);
        ms = parseInt(secParts[1] || '0', 10);
      }

      return h * 3600 + m * 60 + s + ms / 1000;
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Filter out heartbeat comments or API errors in stream
      if (trimmed.startsWith(':') || trimmed.startsWith('ERROR:')) continue;

      try {
        // Handle potential lingering markdown blocks from model
        const cleanLine = trimmed.replace(/^```json/, '').replace(/^```/, '');
        if (!cleanLine) continue;

        const obj = JSON.parse(cleanLine);
        
        // Push even if text is empty but background noise exists
        if (obj.text || obj.background_noise) { 
            cues.push({ 
                start: parseTime(obj.start) + offsetSeconds, 
                end: parseTime(obj.end) + offsetSeconds, 
                text: obj.text || '',
                speaker: obj.speaker,
                background_noise: obj.background_noise
            });
        }
      } catch (e) {
        // Skip invalid lines
      }
    }

    return cues;
  }
}
