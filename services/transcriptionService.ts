
import { db } from './db';
import { ABSService } from './absService';

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
    absService: ABSService, 
    itemId: string, 
    downloadUrl: string
  ): Promise<string> {
    
    console.log('[Transcription] Initiating generation...');

    // Attempt direct full-file transcription first
    try {
      return await this.requestTranscription(downloadUrl);
    } catch (error: any) {
      console.warn("[Transcription] Direct attempt failed. Switching to chunked mode.", error);
      
      // Fallback: Smart Chunking
      // We assume the error might be size-related (ENOSPC/Timeout).
      return await this.processInChunks(absService, itemId, downloadUrl);
    }
  }

  private static async requestTranscription(
    downloadUrl: string, 
    range?: { start: number, end: number }, 
    startTimeOffset?: string
  ): Promise<string> {
    
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        downloadUrl,
        rangeStart: range?.start,
        rangeEnd: range?.end,
        startTimeOffset
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server Error: ${response.status}`);
    }

    const data = await response.json();
    const vttText = data.vtt;

    if (!vttText || !vttText.includes('WEBVTT')) {
       throw new Error("Invalid VTT format received from server.");
    }

    return vttText;
  }

  private static async processInChunks(
    absService: ABSService, 
    itemId: string, 
    downloadUrl: string
  ): Promise<string> {
    
    // 1. Get File Size and Duration for Calculations
    let totalBytes = 0;
    let durationSec = 0;

    try {
        const item = await absService.getLibraryItem(itemId);
        if (item) {
            durationSec = item.media.duration;
            totalBytes = item.size || 0;
        }

        if (totalBytes === 0) {
             // Fallback HEAD request to get size if ABS didn't provide it
             // Note: We need the token from absService for the fetch
             // Using fetch via ABSService helper or raw fetch with hack
             const token = (absService as any).token; 
             const headRes = await fetch(downloadUrl, { method: 'HEAD', headers: { 'Authorization': `Bearer ${token}` } });
             const len = headRes.headers.get('Content-Length');
             if (len) totalBytes = parseInt(len, 10);
        }
    } catch (e) {
        console.warn("Metadata fetch failed", e);
    }

    if (totalBytes === 0 || durationSec === 0) {
        throw new Error("Cannot chunk file: Metadata unavailable.");
    }

    // 2. Configure Chunking (30 minutes approx)
    // Calculate average bytes per second
    const bytesPerSecond = totalBytes / durationSec;
    // Target 30 mins (1800 seconds) or ~25MB safe limit for Vercel /tmp
    const TARGET_CHUNK_SIZE = 25 * 1024 * 1024; // 25MB
    
    // Determine chunking strategy based on size vs duration
    // We prioritize the 25MB safety limit over the 30min request
    const chunks = [];
    let cursor = 0;

    while (cursor < totalBytes) {
        const end = Math.min(cursor + TARGET_CHUNK_SIZE, totalBytes - 1);
        
        // Calculate estimated timestamp for this chunk start
        const startTimeSeconds = cursor / bytesPerSecond;
        const h = Math.floor(startTimeSeconds / 3600);
        const m = Math.floor((startTimeSeconds % 3600) / 60);
        const s = Math.floor(startTimeSeconds % 60);
        const timeOffsetStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        chunks.push({ start: cursor, end, timeOffset: timeOffsetStr });
        cursor = end + 1;
    }

    console.log(`[Transcription] Split into ${chunks.length} chunks.`);

    // 3. Process Chunks Sequentially
    let fullVtt = "WEBVTT\n\n";

    for (const [index, chunk] of chunks.entries()) {
        console.log(`[Transcription] Processing Chunk ${index + 1}/${chunks.length}...`);
        
        try {
            const chunkVtt = await this.requestTranscription(
                downloadUrl, 
                { start: chunk.start, end: chunk.end }, 
                chunk.timeOffset
            );

            // Strip WEBVTT header from chunks and append
            const cleanContent = chunkVtt.replace(/WEBVTT\s*\n*/, '').trim();
            fullVtt += cleanContent + "\n\n";
            
        } catch (e) {
            console.error(`Chunk ${index} failed`, e);
            // Continue best effort? Or fail?
            // For now, append a note in transcript
            fullVtt += `NOTE\nMissing segment due to processing error.\n\n`;
        }
    }

    return this.saveTranscript(itemId, fullVtt);
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
