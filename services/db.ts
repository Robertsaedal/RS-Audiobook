
import Dexie, { type Table } from 'dexie';
import { ABSLibraryItem } from '../types';

export interface OfflineBook {
  itemId: string;
  blob: Blob;
  coverBlob: Blob | null;
  metadata: ABSLibraryItem;
  downloadedAt: number;
}

export interface WishlistItem {
  itemId: string;
  metadata: ABSLibraryItem;
  addedAt: number;
}

export class AppDatabase extends Dexie {
  downloads!: Table<OfflineBook, string>;
  wishlist!: Table<WishlistItem, string>;

  constructor() {
    super('RSAudioDatabase');
    (this as any).version(2).stores({
      downloads: 'itemId, downloadedAt',
      wishlist: 'itemId, addedAt'
    });
  }
}

export const db = new AppDatabase();
