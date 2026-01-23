
import { db, OfflineBook } from './db';
import { ABSService } from './absService';
import { ABSLibraryItem } from '../types';

export class OfflineManager {
  private static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }
    const clonedObj = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        (clonedObj as any)[key] = this.deepClone((obj as any)[key]);
      }
    }
    return clonedObj;
  }

  static async getBook(itemId: string): Promise<OfflineBook | undefined> {
    return db.downloads.get(itemId);
  }

  static async saveBook(
    service: ABSService, 
    item: ABSLibraryItem, 
    onProgress?: (p: number) => void
  ) {
    const downloadUrl = service.getDownloadUrl(item.id);
    const audioBlob = await service.downloadFile(downloadUrl, onProgress);
    
    let coverBlob: Blob | null = null;
    const coverUrl = service.getCoverUrl(item.id);
    if (coverUrl) {
       try {
         coverBlob = await service.downloadFile(coverUrl);
       } catch (e) { 
         console.warn("Cover download failed", e); 
       }
    }

    const rawItem = this.deepClone(item);
    const existing = await db.downloads.get(rawItem.id);

    await db.downloads.put({
      itemId: rawItem.id,
      blob: audioBlob,
      coverBlob,
      metadata: rawItem,
      downloadedAt: Date.now(),
      isWishlisted: existing?.isWishlisted || 0
    });
  }

  // Soft delete: Removes blobs but keeps record if wishlisted
  static async deleteBook(itemId: string) {
    const record = await db.downloads.get(itemId);
    if (!record) return;

    if (record.isWishlisted === 1) {
      await db.downloads.update(itemId, { blob: null, coverBlob: null });
    } else {
      await db.downloads.delete(itemId);
    }
  }

  static async isDownloaded(itemId: string): Promise<boolean> {
    if (!itemId) return false;
    const record = await db.downloads.get(itemId);
    return !!(record && record.blob);
  }

  static async isWishlisted(itemId: string): Promise<boolean> {
    if (!itemId) return false;
    const record = await db.downloads.get(itemId);
    return !!(record && record.isWishlisted === 1);
  }

  static async toggleWishlist(item: ABSLibraryItem): Promise<boolean> {
    const existing = await db.downloads.get(item.id);
    const rawItem = this.deepClone(item);
    
    if (existing) {
      const newState = existing.isWishlisted === 1 ? 0 : 1;
      // If turning off wishlist and no download exists, delete record
      if (newState === 0 && !existing.blob) {
        await db.downloads.delete(item.id);
        return false;
      } else {
        await db.downloads.update(item.id, { isWishlisted: newState });
        return newState === 1;
      }
    } else {
      // Create new record (Wishlist only, no blob)
      await db.downloads.put({
        itemId: rawItem.id,
        blob: null,
        coverBlob: null,
        metadata: rawItem,
        downloadedAt: Date.now(),
        isWishlisted: 1
      });
      return true;
    }
  }
  
  static async getCoverUrl(itemId: string): Promise<string | null> {
    const book = await db.downloads.get(itemId);
    if (book && book.coverBlob) {
      return URL.createObjectURL(book.coverBlob);
    }
    return null;
  }

  static async getAllDownloadedBooks(): Promise<ABSLibraryItem[]> {
    const records = await db.downloads.filter(r => r.blob !== null).toArray();
    return records.sort((a, b) => b.downloadedAt - a.downloadedAt).map(r => r.metadata);
  }

  static async getWishlistBooks(): Promise<ABSLibraryItem[]> {
    const records = await db.downloads.where('isWishlisted').equals(1).toArray();
    return records.sort((a, b) => b.downloadedAt - a.downloadedAt).map(r => r.metadata);
  }
}
