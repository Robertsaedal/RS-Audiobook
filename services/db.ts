
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

export class AppDatabase extends Dexie {
  downloads!: Table<OfflineBook, string>;

  constructor() {
    super('RSAudioDatabase');
    (this as any).version(1).stores({
      downloads: 'itemId, downloadedAt, isWishlisted'
    });
  }
}

export const db = new AppDatabase();
