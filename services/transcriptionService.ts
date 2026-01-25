import { db, TranscriptCue } from './db';
import { ABSLibraryItem } from '../types';
import { ABSService } from './absService';

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1462941148321546290/H0cmE88xjO3T73sJMRg0meSc6ar82TmvILqWCWkoN5jKXpNj4CJeJbhkd8I_1fbDtAXF';

export class TranscriptionService {
  
  /**
   * Checks IndexedDB first, then scans the item's files in ABS for a matching JSON/VTT transcript.
   * Priority:
   * 1. File matches audio filename (e.g. "Book.m4b" -> "Book.vtt" or "Book.json")
   * 2. Heuristic (contains "transcript" or "lyrics")
   * 3. Fallback (Single candidate file)
   * 
   * @param itemId 
   * @param absService 
   * @param forceRefresh If true, bypasses local cache and re-scans server files.
   */
  static async getTranscript(itemId: string, absService: ABSService | null, forceRefresh = false): Promise<TranscriptCue[] | null> {
    // 1. Check Local DB (Cache) - Skip if forcing refresh
    if (!forceRefresh) {
      const record = await db.transcripts.get(itemId);
      if (record && record.cues && record.cues.length > 0) {
        console.log(`[Transcription] Loaded from local cache: ${itemId}`);
        return record.cues;
      }
    } else {
      console.log(`[Transcription] Force refresh requested for ${itemId}. Bypassing cache.`);
      await db.transcripts.delete(itemId);
    }

    if (!absService) {
      console.warn('[Transcription] No ABSService available to fetch files.');
      return null;
    }

    // 2. Scan ABS Library Files
    try {
      console.log(`[Transcription] Scanning files for item: ${itemId}`);
      const files = await absService.getItemFiles(itemId);
      
      if (!files || files.length === 0) {
        console.log(`[Transcription] No files returned from ABS for item ${itemId}`);
        return null;
      }

      // Helper to correctly extract filename from different object structures
      // ABS typically puts the actual filename in `metadata.filename` for library files
      const getFileName = (f: any) => (f.metadata?.filename || f.name || '').trim();

      // Log all files for debugging purposes
      console.log(`[Transcription] Found files:`, files.map((f: any) => getFileName(f)));

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

      // STRATEGY 1: Strict Name Match (Base name of Transcript must match Base name of Audio)
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
                console.log(`[Transcription] Strict match found: ${getFileName(candidate)} (Matches audio: ${audioName})`);
                break;
            }
        }
      }

      // STRATEGY 2: Fallback Logic
      if (!candidate) {
          if (transcriptFiles.length === 1) {
              candidate = transcriptFiles[0];
              console.log(`[Transcription] No strict match, but found single valid candidate: ${getFileName(candidate)}`);
          } else if (transcriptFiles.length > 1) {
              const heuristicMatch = transcriptFiles.find((f: any) => {
                  const n = getFileName(f).toLowerCase();
                  return n.includes('transcript') || n.includes('lyrics') || n.includes('subs');
              });
              
              if (heuristicMatch) {
                  candidate = heuristicMatch;
                  console.log(`[Transcription] Heuristic match found: ${getFileName(candidate)}`);
              } else {
                  console.log(`[Transcription] Multiple transcript files found but none matched audio filename. Skipping.`);
              }
          }
      }

      if (!candidate || !candidate.ino) {
        console.log(`[Transcription] No valid transcript file identified.`);
        return null;
      }

      // Fetch
      const candidateName = getFileName(candidate);
      console.log(`[Transcription] Fetching: ${candidateName}...`);
      const fileUrl = absService.getRawFileUrl(itemId, candidate.ino);
      
      const response = await fetch(fileUrl);
      if (!response.ok) {
        console.warn(`[Transcription] Download failed: ${response.status} ${response.statusText}`);
        return null;
      }

      let cues: TranscriptCue[] = [];
      const isVtt = candidateName.toLowerCase().endsWith('.vtt');

      if (isVtt) {
        const textData = await response.text();
        cues = this.parseVTT(textData);
      } else {
        const data = await response.json();
        cues = this.parseJSON(data);
      }

      if (cues.length > 0) {
        console.log(`[Transcription] Successfully parsed ${cues.length} cues.`);
        // Save to DB for faster future access
        await db.transcripts.put({
            itemId,
            cues,
            createdAt: Date.now()
        });
        return cues;
      } else {
        console.warn(`[Transcription] File parsed but found no valid cues.`);
      }

      return null;

    } catch (e) {
      console.error(`[Transcription] Error processing transcript for ${itemId}`, e);
      return null;
    }
  }

  /**
   * Builds a "Safe Context" for the Oracle AI.
   * - Includes current book transcript UP TO currentTime.
   * - Includes FULL transcripts of previous books in the series.
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
        // Filter for previous books
        const previousBooks = allSeriesBooks
          .filter(b => {
            const bSeq = parseFloat(String(b.media.metadata.seriesSequence || b.media.metadata.sequence || '999999'));
            // Check implicit series array if top level is missing
            const bSeqAlt = Array.isArray(b.media.metadata.series) && b.media.metadata.series.length > 0 
                ? parseFloat(String(b.media.metadata.series[0].sequence)) 
                : 999999;
            
            const finalSeq = bSeq !== 999999 ? bSeq : bSeqAlt;
            return finalSeq < currentSeq;
          })
          .sort((a, b) => {
             // sort asc
             const seqA = parseFloat(String(a.media.metadata.seriesSequence || 0));
             const seqB = parseFloat(String(b.media.metadata.seriesSequence || 0));
             return seqA - seqB;
          });

        // 3. Load full transcripts for previous books
        for (const prevBook of previousBooks) {
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
      // SLICER LOGIC: Only cues that have ended before or slightly after current time
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
    
    // Regex for "00:00:00.000 --> 00:00:00.000" or "00:00.000 --> 00:00.000"
    const timeRegex = /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line === 'WEBVTT') continue;

        const match = line.match(timeRegex);
        if (match) {
            const start = this.parseTime(match[1]);
            const end = this.parseTime(match[2]);
            
            let text = '';
            
            // Gather text lines until empty line or next timestamp
            let j = i + 1;
            while (j < lines.length) {
                const nextLine = lines[j].trim();
                if (!nextLine) break; // Empty line ends cue
                if (nextLine.includes('-->')) break; // Next cue starts
                
                text += (text ? ' ' : '') + nextLine;
                j++;
            }
            
            if (text) {
                cues.push({ start, end, text });
            }
            i = j - 1; // Advance outer loop
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
      if (Array.isArray(data.transcription)) {
           rawCues = data.transcription;
      } else if (Array.isArray(data.transcription.segments)) {
           rawCues = data.transcription.segments;
      } else if (Array.isArray(data.transcription.cues)) {
           rawCues = data.transcription.cues;
      }
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

  static async deleteTranscript(itemId: string): Promise<void> {
    await db.transcripts.delete(itemId);
  }

  static async requestTranscript(item: ABSLibraryItem, note?: string): Promise<boolean> {
    console.log(`[Transcription] Sending request for ${item.media.metadata.title}`);
    
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
      console.error("[Transcription] Failed to send webhook", e);
      return false;
    }
  }
}
