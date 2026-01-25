
import { db, TranscriptCue } from './db';
import { ABSLibraryItem } from '../types';
import { ABSService } from './absService';

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1462941148321546290/H0cmE88xjO3T73sJMRg0meSc6ar82TmvILqWCWkoN5jKXpNj4CJeJbhkd8I_1fbDtAXF';

export class TranscriptionService {
  
  /**
   * Checks IndexedDB first, then scans the item's files in ABS for a matching JSON transcript.
   * Priority:
   * 1. File matches audio filename (e.g. "Book.m4b" -> "Book.json")
   * 2. Heuristic (contains "transcript" or "lyrics")
   * 3. Fallback (Single .json that isn't metadata.json)
   */
  static async getTranscript(itemId: string, absService: ABSService | null): Promise<TranscriptCue[] | null> {
    // 1. Check Local DB (Cache)
    const record = await db.transcripts.get(itemId);
    if (record && record.cues && record.cues.length > 0) {
      console.log(`[Transcription] Loaded from local cache: ${itemId}`);
      return record.cues;
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

      // Log all files for debugging purposes
      console.log(`[Transcription] Found files:`, files.map((f: any) => f.name));

      const audioExtensions = ['.m4b', '.mp3', '.m4a', '.flac', '.ogg', '.opus', '.wav', '.wma', '.aac'];
      const ignoredJsonNames = ['metadata.json', 'abs_metadata.json', 'chapter_metadata.json', 'ffmetadata.json'];

      // Filter Audio Files
      const audioFiles = files.filter((f: any) => {
          const name = (f.name || '').toLowerCase();
          return audioExtensions.some(ext => name.endsWith(ext));
      });

      // Filter Candidate JSON Files (Exclude standard metadata)
      const jsonFiles = files.filter((f: any) => {
          const name = (f.name || '').toLowerCase();
          return (name.endsWith('.json') || name.endsWith('.jason')) 
                 && !ignoredJsonNames.includes(name);
      });

      let candidate: any = null;

      // STRATEGY 1: Strict Name Match (Base name of JSON must match Base name of Audio)
      // This solves the issue where "metadata.json" exists alongside "BookName.m4b"
      if (audioFiles.length > 0) {
        for (const audio of audioFiles) {
            const audioName = audio.name;
            const lastDotIndex = audioName.lastIndexOf('.');
            if (lastDotIndex === -1) continue;
            
            const audioBase = audioName.substring(0, lastDotIndex).toLowerCase();

            const match = jsonFiles.find((f: any) => {
                const jsonName = f.name;
                const jsonBase = jsonName.substring(0, jsonName.lastIndexOf('.')).toLowerCase();
                return jsonBase === audioBase;
            });
            
            if (match) {
                candidate = match;
                console.log(`[Transcription] Strict match found: ${candidate.name} (Matches audio: ${audio.name})`);
                break;
            }
        }
      }

      // STRATEGY 2: Fallback Logic
      if (!candidate) {
          if (jsonFiles.length === 1) {
              // Only one candidate and it's not metadata.json? Use it.
              candidate = jsonFiles[0];
              console.log(`[Transcription] No strict match, but found single valid candidate: ${candidate.name}`);
          } else if (jsonFiles.length > 1) {
              // Multiple candidates, but none matched audio. Try heuristic keyword search.
              const heuristicMatch = jsonFiles.find((f: any) => {
                  const n = f.name.toLowerCase();
                  return n.includes('transcript') || n.includes('lyrics') || n.includes('subs');
              });
              
              if (heuristicMatch) {
                  candidate = heuristicMatch;
                  console.log(`[Transcription] Heuristic match found: ${candidate.name}`);
              } else {
                  console.log(`[Transcription] Multiple JSON files found but none matched audio filename. Skipping to avoid loading incorrect metadata.`);
              }
          }
      }

      if (!candidate || !candidate.ino) {
        console.log(`[Transcription] No valid transcript file identified.`);
        return null;
      }

      // Fetch
      console.log(`[Transcription] Fetching: ${candidate.name}...`);
      const fileUrl = absService.getRawFileUrl(itemId, candidate.ino);
      
      const response = await fetch(fileUrl);
      if (!response.ok) {
        console.warn(`[Transcription] Download failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      
      // 3. Parse & Normalize Format
      let cues: TranscriptCue[] = [];
      let rawCues: any[] = [];

      // Detect different JSON structures
      if (Array.isArray(data)) {
        rawCues = data;
      } else if (Array.isArray(data.cues)) {
        rawCues = data.cues;
      } else if (Array.isArray(data.segments)) {
        // OpenAI Whisper standard
        rawCues = data.segments;
      } else if (data.transcription) {
        // Handle wrapper object (e.g., { filename: "...", transcription: [...] })
        if (Array.isArray(data.transcription)) {
             rawCues = data.transcription;
        } else if (Array.isArray(data.transcription.segments)) {
             rawCues = data.transcription.segments;
        } else if (Array.isArray(data.transcription.cues)) {
             rawCues = data.transcription.cues;
        }
      }
      
      if (rawCues.length > 0) {
        cues = rawCues.map((entry: any) => ({
            start: Number(entry.start) || Number(entry.startTime) || 0,
            end: Number(entry.end) || Number(entry.endTime) || 0,
            text: String(entry.text || ''),
            speaker: entry.speaker,
            background_noise: entry.background_noise
        }))
        .filter(c => c.text && c.text.trim().length > 0)
        .sort((a, b) => a.start - b.start);

        console.log(`[Transcription] Successfully parsed ${cues.length} cues.`);
        // Save to DB for faster future access
        await db.transcripts.put({
            itemId,
            cues,
            createdAt: Date.now()
        });
        return cues;
      } else {
        console.warn(`[Transcription] File parsed but found no valid array in known keys (cues, segments, transcription).`);
      }

      return null;

    } catch (e) {
      console.error(`[Transcription] Error processing transcript for ${itemId}`, e);
      return null;
    }
  }

  static async deleteTranscript(itemId: string): Promise<void> {
    await db.transcripts.delete(itemId);
  }

  /**
   * Sends a request to Discord Webhook
   */
  static async requestTranscript(item: ABSLibraryItem, note?: string): Promise<boolean> {
    console.log(`[Transcription] Sending request for ${item.media.metadata.title}`);
    
    const payload = {
      embeds: [{
        title: `Transcript Request`,
        description: `User requested lyrics/transcript for a missing item.`,
        color: 3447003, // Blue-ish
        fields: [
          { name: 'Item Title', value: item.media.metadata.title || 'Unknown', inline: true },
          { name: 'Author', value: item.media.metadata.authorName || 'Unknown', inline: true },
          { name: 'Item ID', value: item.id, inline: false },
          { name: 'User Note', value: note || 'None provided.' }
        ],
        footer: {
          text: 'R.S Archive • Transcript System'
        },
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
