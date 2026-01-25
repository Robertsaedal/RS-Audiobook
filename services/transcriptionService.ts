
import { db, TranscriptCue } from './db';

export class TranscriptionService {
  
  static async getTranscript(itemId: string): Promise<TranscriptCue[] | null> {
    const record = await db.transcripts.get(itemId);
    if (record && record.cues) {
      return record.cues;
    }
    // Backward compatibility: If we encounter an old record format, return null to force regeneration
    return null;
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
  ): Promise<TranscriptCue[]> {
    
    console.log(`[Transcription] Requesting smart segment transcription at ${currentTime}s`);

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
          // Filter out log lines from backend
          const lines = chunk.split('\n');
          const cleanLines = lines.filter(line => !line.trim().startsWith(': status:') && !line.trim().startsWith('ERROR:'));
          
          if (cleanLines.length > 0) {
              const cleanChunk = cleanLines.join('\n');
              if (onChunk && cleanChunk.trim()) onChunk(cleanChunk);
          }

          fullText += chunk;
        }
      }

      return this.saveTranscript(itemId, fullText, currentTime);

    } catch (error: any) {
      console.error("Transcription Service Error:", error);
      throw error;
    }
  }

  private static async saveTranscript(itemId: string, rawContent: string, offset: number): Promise<TranscriptCue[]> {
    // 1. Parse the new chunk of text into cues
    const newCues = this.parseTranscript(rawContent, offset);
    
    if (newCues.length === 0) return [];

    // 2. Load existing transcript
    const existingRecord = await db.transcripts.get(itemId);
    let allCues = existingRecord?.cues || [];

    // 3. Merge Strategy: Append and Deduplicate
    allCues = [...allCues, ...newCues];

    // Remove duplicates based on exact start time and text
    const seen = new Set();
    allCues = allCues.filter(c => {
        const key = `${Math.floor(c.start * 100)}_${c.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Sort by start time to ensure order
    allCues.sort((a, b) => a.start - b.start);

    await db.transcripts.put({
      itemId,
      cues: allCues, 
      createdAt: existingRecord?.createdAt || Date.now()
    });
    
    return allCues;
  }

  static parseTranscript(jsonlString: string, offsetSeconds: number = 0): TranscriptCue[] {
    const lines = jsonlString.split(/\r?\n/);
    const cues: TranscriptCue[] = [];

    const parseTime = (timeStr: string) => {
      if (!timeStr) return 0;
      // Handle "HH:MM:SS.mmm" or "MM:SS.mmm"
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
      } else {
         return 0;
      }

      return h * 3600 + m * 60 + s + ms / 1000;
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      if (trimmed.startsWith(':') || trimmed.startsWith('ERROR:')) continue;

      try {
        const cleanLine = trimmed.replace(/^```json/, '').replace(/^```/, '').replace(/,$/, '');
        if (!cleanLine || cleanLine === '[' || cleanLine === ']') continue;

        const obj = JSON.parse(cleanLine);
        
        if (obj.text || obj.background_noise) { 
            // CRITICAL: Add offsetSeconds here so DB stores ABSOLUTE cues relative to book start
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
