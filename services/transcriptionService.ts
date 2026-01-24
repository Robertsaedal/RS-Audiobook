
import { db } from './db';

export interface TranscriptCue {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  background_noise?: string; 
}

export class TranscriptionService {
  
  static async getTranscript(itemId: string): Promise<string | null> {
    const record = await db.transcripts.get(itemId);
    return record ? record.vttContent : null;
  }

  static async deleteTranscript(itemId: string): Promise<void> {
    await db.transcripts.delete(itemId);
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
          
          // CRITICAL: Filter out heartbeat messages (: status: ...) from the UI/Parsing
          // but keep valid JSON/Text.
          
          // Split by newline to handle cases where a chunk contains both status and data
          const lines = chunk.split('\n');
          const cleanLines = lines.filter(line => !line.trim().startsWith(': status:') && !line.trim().startsWith('ERROR:'));
          
          if (cleanLines.length > 0) {
              // Pass clean content to callback (if UI needs to stream text)
              const cleanChunk = cleanLines.join('\n');
              if (onChunk && cleanChunk.trim()) onChunk(cleanChunk);
          }

          // Accumulate full text for final saving
          // We remove status lines from the final text to keep the DB clean
          fullText += chunk;
        }
      }

      return this.saveTranscript(itemId, fullText);

    } catch (error: any) {
      console.error("Transcription Service Error:", error);
      throw error;
    }
  }

  private static async saveTranscript(itemId: string, rawContent: string): Promise<string> {
    // Clean up content before saving
    const cleanContent = rawContent
      .split('\n')
      .filter(line => !line.startsWith(': status:') && !line.startsWith('ERROR:'))
      .join('\n');

    await db.transcripts.put({
      itemId,
      vttContent: cleanContent, 
      createdAt: Date.now()
    });
    return cleanContent;
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
      
      // Filter out heartbeat comments (: status: ...) and errors
      if (trimmed.startsWith(':') || trimmed.startsWith('ERROR:')) continue;

      try {
        // Handle potential lingering markdown blocks from model (e.g., ```json)
        const cleanLine = trimmed.replace(/^```json/, '').replace(/^```/, '').replace(/,$/, ''); // Remove trailing comma if model outputs array style
        if (!cleanLine || cleanLine === '[' || cleanLine === ']') continue;

        const obj = JSON.parse(cleanLine);
        
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
