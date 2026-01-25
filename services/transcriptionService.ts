
import { db, TranscriptCue } from './db';
import { ABSLibraryItem } from '../types';

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1462941148321546290/H0cmE88xjO3T73sJMRg0meSc6ar82TmvILqWCWkoN5jKXpNj4CJeJbhkd8I_1fbDtAXF';

export class TranscriptionService {
  
  /**
   * Checks IndexedDB first, then tries to fetch a static JSON file from the server.
   */
  static async getTranscript(itemId: string): Promise<TranscriptCue[] | null> {
    // 1. Check Local DB
    const record = await db.transcripts.get(itemId);
    if (record && record.cues && record.cues.length > 0) {
      return record.cues;
    }

    // 2. Check Static File (Local Program Output)
    return this.fetchStaticTranscript(itemId);
  }

  static async deleteTranscript(itemId: string): Promise<void> {
    await db.transcripts.delete(itemId);
  }

  /**
   * Attempts to fetch /transcripts/{itemId}.json
   */
  private static async fetchStaticTranscript(itemId: string): Promise<TranscriptCue[] | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

      const response = await fetch(`/transcripts/${itemId}.json`, { 
          signal: controller.signal 
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status !== 404) {
            console.warn(`[Transcription] Failed to fetch static file: ${response.status}`);
        }
        return null;
      }

      const data = await response.json();
      
      // Validate and Normalize Format
      // Assuming local program outputs Array of { start, end, text, ... }
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
        console.log(`[Transcription] Found local file for ${itemId} (${cues.length} lines)`);
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
      console.warn(`[Transcription] Error fetching static transcript for ${itemId}`, e);
      return null;
    }
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
