
import Dexie, { type Table } from 'dexie';
import { ABSLibraryItem } from '../types';

export interface OfflineBook {
  itemId: string;
  blob: Blob | null; // Nullable if only wishlisted
  coverBlob: Blob | null;
  metadata: ABSLibraryItem;
  downloadedAt: number;
  isWishlisted?: number; // 0 or 1 for indexing
}

export interface TranscriptCue {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  background_noise?: string; 
}

export interface TranscriptRecord {
  itemId: string;
  cues: TranscriptCue[];
  createdAt: number;
}

export class AppDatabase extends Dexie {
  downloads!: Table<OfflineBook, string>;
  transcripts!: Table<TranscriptRecord, string>;

  constructor() {
    super('RSAudioDatabase');
    (this as any).version(1).stores({
      downloads: 'itemId, downloadedAt, isWishlisted',
      transcripts: 'itemId, createdAt'
    });
  }
}

export const db = new AppDatabase();
