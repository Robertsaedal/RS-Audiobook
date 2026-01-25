
import { db, TranscriptCue } from './db';
import { ABSLibraryItem } from '../types';
import { ABSService } from './absService';

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1462941148321546290/H0cmE88xjO3T73sJMRg0meSc6ar82TmvILqWCWkoN5jKXpNj4CJeJbhkd8I_1fbDtAXF';

export class TranscriptionService {
  
  /**
   * Checks IndexedDB first, then tries to find a JSON file in the item's library files via ABS API.
   */
  static async getTranscript(itemId: string, absService: ABSService | null): Promise<TranscriptCue[] | null> {
    // 1. Check Local DB
    const record = await db.transcripts.get(itemId);
    if (record && record.cues && record.cues.length > 0) {
      return record.cues;
    }

    if (!absService) return null;

    // 2. Fetch from ABS Files
    try {
      const files = await absService.getItemFiles(itemId);
      
      // Look for a .json (or .jason as per user report) file
      const candidate = files.find((f: any) => {
          const name = (f.name || '').toLowerCase();
          return name.endsWith('.json') || name.endsWith('.jason');
      });

      if (!candidate || !candidate.ino) return null;

      const fileUrl = absService.getRawFileUrl(itemId, candidate.ino);
      
      const response = await fetch(fileUrl);
      if (!response.ok) {
        if (response.status !== 404) console.warn(`[Transcription] Fetch failed: ${response.status}`);
        return null;
      }

      const data = await response.json();
      
      // Validate and Normalize Format
      let cues: TranscriptCue[] = [];
      
      if (Array.isArray(data)) {
        cues = data.map((entry: any) => ({
            start: Number(entry.start) || 0,
            end: Number(entry.end) || 0,
            text: String(entry.text || ''),
            speaker: entry.speaker,
            background_noise: entry.background_noise
        })).filter(c => c.text.trim().length > 0).sort((a, b) => a.start - b.start);
      }

      if (cues.length > 0) {
        console.log(`[Transcription] Found file '${candidate.name}' for ${itemId} (${cues.length} lines)`);
        // Save to DB for faster future access
        await db.transcripts.put({
            itemId,
            cues,
            createdAt: Date.now()
        });
        return cues;
      }
      return null;

    } catch (e) {
      console.warn(`[Transcription] Error fetching transcript for ${itemId}`, e);
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
