
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

  static async generateTranscript(
    itemId: string, 
    downloadUrl: string,
    duration: number,
    onChunk?: (chunk: string) => void,
    currentTime: number = 0 
  ): Promise<string> {
    
    console.log(`[Transcription] Initiating stream request for ${itemId} at ${currentTime}s...`);

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

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = '';
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          // Only accumulate non-heartbeat content (heartbeats start with :)
          if (!chunk.startsWith(':')) {
             fullText += chunk;
          }
          if (onChunk) onChunk(chunk);
        }
      }

      // Cleanup markdown artifacts if the model included them despite instructions
      const cleaned = fullText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .replace(/^[:\s]+/, '')
        .trim();
        
      if (!cleaned) {
        throw new Error("Received empty response from transcription artifact.");
      }

      return this.saveTranscript(itemId, cleaned);

    } catch (error: any) {
      console.error("[Transcription Service] Failure:", error);
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

  /**
   * Robust parser that extracts JSON objects from a potentially messy text stream.
   */
  static parseTranscript(rawContent: string, offsetSeconds: number = 0): TranscriptCue[] {
    const cues: TranscriptCue[] = [];
    
    // Non-greedy search for top-level JSON objects
    const jsonObjectRegex = /{[^]*?}/g;
    const matches = rawContent.match(jsonObjectRegex);

    if (!matches) {
      console.warn("[Transcription] No valid artifact segments found in data.");
      return [];
    }

    const parseTime = (timeStr: string) => {
      if (!timeStr) return 0;
      const parts = timeStr.trim().split(':');
      let h = 0, m = 0, s = 0, ms = 0;
      
      try {
        if (parts.length === 3) {
          h = parseInt(parts[0], 10);
          m = parseInt(parts[1], 10);
          const secParts = parts[2].split('.');
          s = parseInt(secParts[0], 10);
          ms = parseInt(secParts[1]?.substring(0, 3) || '0', 10);
        } else if (parts.length === 2) {
          m = parseInt(parts[0], 10);
          const secParts = parts[1].split('.');
          s = parseInt(secParts[0], 10);
          ms = parseInt(secParts[1]?.substring(0, 3) || '0', 10);
        }
      } catch (e) { return 0; }

      return h * 3600 + m * 60 + s + ms / 1000;
    };

    for (const match of matches) {
      try {
        const obj = JSON.parse(match);
        
        // Ensure the object has at least content or noise
        if (obj.text !== undefined || obj.background_noise !== undefined) { 
            cues.push({ 
                start: parseTime(obj.start) + offsetSeconds, 
                end: parseTime(obj.end) + offsetSeconds, 
                text: obj.text || '',
                speaker: obj.speaker,
                background_noise: obj.background_noise
            });
        }
      } catch (e) {
        // Log individual object parsing failures for debugging
        console.debug("[Transcription] Segment parse error:", e);
      }
    }

    // Sort by timeline to ensure smooth UI flow
    return cues.sort((a, b) => a.start - b.start);
  }
}
