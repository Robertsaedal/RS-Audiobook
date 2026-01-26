
import { db, TranscriptCue } from './db';
import { ABSLibraryItem } from '../types';
import { ABSService } from './absService';

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1462941148321546290/H0cmE88xjO3T73sJMRg0meSc6ar82TmvILqWCWkoN5jKXpNj4CJeJbhkd8I_1fbDtAXF';

export class TranscriptionService {
  
  /**
   * Scans the server for a matching transcript file but DOES NOT download it.
   * Returns metadata about the candidate file if found.
   */
  static async scanForCandidate(itemId: string, absService: ABSService | null): Promise<{ url: string, name: string, ino: string } | null> {
    if (!absService) return null;

    try {
      console.log(`[Transcription] Scanning files for item: ${itemId}`);
      const files = await absService.getItemFiles(itemId);
      
      if (!files || files.length === 0) return null;

      const getFileName = (f: any) => (f.metadata?.filename || f.name || '').trim();

      const audioExtensions = ['.m4b', '.mp3', '.m4a', '.flac', '.ogg', '.opus', '.wav', '.wma', '.aac'];
      const ignoredJsonNames = ['metadata.json', 'abs_metadata.json', 'chapter_metadata.json', 'ffmetadata.json'];

      // Filter Audio Files
      const audioFiles = files.filter((f: any) => {
          const name = getFileName(f).toLowerCase();
          return audioExtensions.some(ext => name.endsWith(ext));
      });

      // Filter Candidate Transcript Files (JSON or VTT)
      const transcriptFiles = files.filter((f: any) => {
          const name = getFileName(f).toLowerCase();
          const isJson = (name.endsWith('.json') || name.endsWith('.jason')) && !ignoredJsonNames.includes(name);
          const isVtt = name.endsWith('.vtt');
          return isJson || isVtt;
      });

      let candidate: any = null;

      // STRATEGY 1: Strict Name Match
      if (audioFiles.length > 0) {
        for (const audio of audioFiles) {
            const audioName = getFileName(audio);
            const lastDotIndex = audioName.lastIndexOf('.');
            if (lastDotIndex === -1) continue;
            
            const audioBase = audioName.substring(0, lastDotIndex).toLowerCase();

            const match = transcriptFiles.find((f: any) => {
                const tName = getFileName(f);
                const tBase = tName.substring(0, tName.lastIndexOf('.')).toLowerCase();
                return tBase === audioBase;
            });
            
            if (match) {
                candidate = match;
                break;
            }
        }
      }

      // STRATEGY 2: Fallback Logic
      if (!candidate) {
          if (transcriptFiles.length === 1) {
              candidate = transcriptFiles[0];
          } else if (transcriptFiles.length > 1) {
              const heuristicMatch = transcriptFiles.find((f: any) => {
                  const n = getFileName(f).toLowerCase();
                  return n.includes('transcript') || n.includes('lyrics') || n.includes('subs');
              });
              if (heuristicMatch) candidate = heuristicMatch;
          }
      }

      if (candidate && candidate.ino) {
        return {
          url: absService.getRawFileUrl(itemId, candidate.ino),
          name: getFileName(candidate),
          ino: candidate.ino
        };
      }

      return null;
    } catch (e) {
      console.error(`[Transcription] Error scanning for ${itemId}`, e);
      return null;
    }
  }

  /**
   * Downloads, parses, and caches a specific transcript file.
   */
  static async downloadAndCache(itemId: string, fileUrl: string, fileName: string): Promise<TranscriptCue[] | null> {
    try {
      console.log(`[Transcription] Downloading: ${fileName}...`);
      
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);

      let cues: TranscriptCue[] = [];
      const isVtt = fileName.toLowerCase().endsWith('.vtt');

      if (isVtt) {
        const textData = await response.text();
        cues = this.parseVTT(textData);
      } else {
        const data = await response.json();
        cues = this.parseJSON(data);
      }

      if (cues.length > 0) {
        await db.transcripts.put({
            itemId,
            cues,
            createdAt: Date.now()
        });
        return cues;
      }
      
      return null;
    } catch (e) {
      console.error(`[Transcription] Error downloading/parsing ${itemId}`, e);
      return null;
    }
  }

  /**
   * Legacy method kept for backward compatibility and Oracle context building.
   * Tries to find AND download in one go.
   */
  static async getTranscript(itemId: string, absService: ABSService | null, forceRefresh = false): Promise<TranscriptCue[] | null> {
    if (!forceRefresh) {
      const record = await db.transcripts.get(itemId);
      if (record && record.cues && record.cues.length > 0) {
        return record.cues;
      }
    } else {
      await db.transcripts.delete(itemId);
    }

    const candidate = await this.scanForCandidate(itemId, absService);
    if (candidate) {
      return this.downloadAndCache(itemId, candidate.url, candidate.name);
    }
    
    return null;
  }

  /**
   * Builds a "Safe Context" for the Oracle AI.
   * Includes current book transcript UP TO currentTime.
   */
  static async getOracleContext(
    currentItem: ABSLibraryItem,
    currentTime: number,
    absService: ABSService
  ): Promise<{ context: string, booksIncluded: string[] }> {
    
    let context = "";
    const booksIncluded: string[] = [];
    const meta = currentItem.media.metadata;

    // 1. Identify Series info
    let seriesId = meta.seriesId;
    let currentSeq = parseFloat(String(meta.seriesSequence || meta.sequence || '999999'));

    if (!seriesId && Array.isArray(meta.series) && meta.series.length > 0) {
      seriesId = meta.series[0].id;
      currentSeq = parseFloat(String(meta.series[0].sequence || '999999'));
    }

    // 2. Fetch Previous Books (if part of a series)
    if (seriesId) {
      try {
        const allSeriesBooks = await absService.getSeriesBooks(seriesId);
        const previousBooks = allSeriesBooks
          .filter(b => {
            const bSeq = parseFloat(String(b.media.metadata.seriesSequence || b.media.metadata.sequence || '999999'));
            const bSeqAlt = Array.isArray(b.media.metadata.series) && b.media.metadata.series.length > 0 
                ? parseFloat(String(b.media.metadata.series[0].sequence)) 
                : 999999;
            const finalSeq = bSeq !== 999999 ? bSeq : bSeqAlt;
            return finalSeq < currentSeq;
          })
          .sort((a, b) => {
             const seqA = parseFloat(String(a.media.metadata.seriesSequence || 0));
             const seqB = parseFloat(String(b.media.metadata.seriesSequence || 0));
             return seqA - seqB;
          });

        for (const prevBook of previousBooks) {
           // We try to get from cache first, but we won't force download previous books to save bandwidth/time
           const cues = await this.getTranscript(prevBook.id, absService);
           if (cues && cues.length > 0) {
             const fullText = cues.map(c => c.text).join(' ');
             context += `BOOK: ${prevBook.media.metadata.title}\nCONTEXT: ${fullText}\n\n`;
             booksIncluded.push(prevBook.media.metadata.title);
           }
        }
      } catch (e) {
        console.warn("[Oracle] Failed to fetch previous series books", e);
      }
    }

    // 4. Load & Slice Current Book
    const currentCues = await this.getTranscript(currentItem.id, absService);
    if (currentCues && currentCues.length > 0) {
      const safeCues = currentCues.filter(c => c.end <= currentTime + 5); 
      const safeText = safeCues.map(c => c.text).join(' ');
      
      context += `CURRENT BOOK: ${meta.title}\n`;
      context += `CURRENT READING POSITION: Chapter/Time is approximately ${Math.floor(currentTime)} seconds in.\n`;
      context += `KNOWN CONTEXT (Everything read so far):\n${safeText}\n`;
      booksIncluded.push(meta.title);
    } else {
      context += `CURRENT BOOK: ${meta.title}\n(No transcript available for this book yet. Answer based on general knowledge if possible, but warn the user.)\n`;
    }

    return { context, booksIncluded };
  }

  // --- VTT PARSER ---
  static parseVTT(vttText: string): TranscriptCue[] {
    const lines = vttText.split(/\r?\n/);
    const cues: TranscriptCue[] = [];
    const timeRegex = /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line === 'WEBVTT') continue;

        const match = line.match(timeRegex);
        if (match) {
            const start = this.parseTime(match[1]);
            const end = this.parseTime(match[2]);
            let text = '';
            let j = i + 1;
            while (j < lines.length) {
                const nextLine = lines[j].trim();
                if (!nextLine) break; 
                if (nextLine.includes('-->')) break; 
                text += (text ? ' ' : '') + nextLine;
                j++;
            }
            if (text) cues.push({ start, end, text });
            i = j - 1;
        }
    }
    return cues;
  }

  static parseTime(timeStr: string): number {
      const parts = timeStr.split(':');
      let seconds = 0;
      if (parts.length === 3) {
        seconds += parseInt(parts[0], 10) * 3600;
        seconds += parseInt(parts[1], 10) * 60;
        seconds += parseFloat(parts[2]);
      } else if (parts.length === 2) {
        seconds += parseInt(parts[0], 10) * 60;
        seconds += parseFloat(parts[1]);
      }
      return seconds;
  }

  // --- JSON PARSER ---
  static parseJSON(data: any): TranscriptCue[] {
    let rawCues: any[] = [];
    if (Array.isArray(data)) {
      rawCues = data;
    } else if (Array.isArray(data.cues)) {
      rawCues = data.cues;
    } else if (Array.isArray(data.segments)) {
      rawCues = data.segments;
    } else if (data.transcription) {
      if (Array.isArray(data.transcription)) rawCues = data.transcription;
      else if (Array.isArray(data.transcription.segments)) rawCues = data.transcription.segments;
      else if (Array.isArray(data.transcription.cues)) rawCues = data.transcription.cues;
    }
    
    return rawCues.map((entry: any) => ({
        start: Number(entry.start) || Number(entry.startTime) || 0,
        end: Number(entry.end) || Number(entry.endTime) || 0,
        text: String(entry.text || ''),
        speaker: entry.speaker,
        background_noise: entry.background_noise
    }))
    .filter(c => c.text && c.text.trim().length > 0)
    .sort((a, b) => a.start - b.start);
  }

  static async requestTranscript(item: ABSLibraryItem, note?: string): Promise<boolean> {
    const payload = {
      embeds: [{
        title: `Transcript Request`,
        description: `User requested lyrics/transcript for a missing item.`,
        color: 3447003,
        fields: [
          { name: 'Item Title', value: item.media.metadata.title || 'Unknown', inline: true },
          { name: 'Author', value: item.media.metadata.authorName || 'Unknown', inline: true },
          { name: 'Item ID', value: item.id, inline: false },
          { name: 'User Note', value: note || 'None provided.' }
        ],
        footer: { text: 'R.S Archive • Transcript System' },
        timestamp: new Date().toISOString()
      }]
    };
    try {
      const res = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }
}
