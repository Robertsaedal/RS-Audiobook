import Dexie, { type Table } from 'dexie';
import { ABSLibraryItem } from '../types';

export interface OfflineBook {
  itemId: string;
  blob: Blob;
  coverBlob: Blob | null;
  metadata: ABSLibraryItem;
  downloadedAt: number;
}

export class AppDatabase extends Dexie {
  downloads!: Table<OfflineBook, string>;

  constructor() {
    super('RSAudioDatabase');
    this.version(1).stores({
      downloads: 'itemId, downloadedAt'
    });
  }
}

export const db = new AppDatabase();
