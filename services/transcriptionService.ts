
import { db, TranscriptCue } from './db';
import { ABSLibraryItem } from '../types';
import { ABSService } from './absService';

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1462941148321546290/H0cmE88xjO3T73sJMRg0meSc6ar82TmvILqWCWkoN5jKXpNj4CJeJbhkd8I_1fbDtAXF';

export class TranscriptionService {
  
  /**
   * Checks IndexedDB first, then scans the item's files in ABS for a matching JSON transcript.
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

      // Look for a .json or .jason file
      const candidate = files.find((f: any) => {
          const name = (f.name || '').toLowerCase();
          return name.endsWith('.json') || name.endsWith('.jason');
      });

      if (!candidate || !candidate.ino) {
        console.log(`[Transcription] No matching .json or .jason file found.`);
        return null;
      }

      console.log(`[Transcription] Match found: ${candidate.name}. Fetching...`);
      const fileUrl = absService.getRawFileUrl(itemId, candidate.ino);
      
      const response = await fetch(fileUrl);
      if (!response.ok) {
        console.warn(`[Transcription] Download failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      
      // 3. Parse & Normalize Format
      let cues: TranscriptCue[] = [];
      
      // Expected format: Array of objects with { start, end, text }
      // Supporting both seconds (number) and string timestamps if necessary, but assuming number based on previous context.
      if (Array.isArray(data)) {
        cues = data.map((entry: any) => ({
            start: Number(entry.start) || 0,
            end: Number(entry.end) || 0,
            text: String(entry.text || ''),
            speaker: entry.speaker,
            background_noise: entry.background_noise
        }))
        .filter(c => c.text && c.text.trim().length > 0)
        .sort((a, b) => a.start - b.start);
      } else {
        console.warn(`[Transcription] JSON format unrecognized (not an array).`);
        return null;
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
        console.warn(`[Transcription] File parsed but contained no valid cues.`);
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
