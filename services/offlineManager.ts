
import { db } from './db';
import { ABSService } from './absService';
import { ABSLibraryItem } from '../types';

export class OfflineManager {
  private static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.deepClone(item)) as unknown as T;
    const clonedObj = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        (clonedObj as any)[key] = this.deepClone((obj as any)[key]);
      }
    }
    return clonedObj;
  }

  static async saveBook(service: ABSService, item: ABSLibraryItem, onProgress?: (p: number) => void) {
    const downloadUrl = service.getDownloadUrl(item.id);
    const audioBlob = await service.downloadFile(downloadUrl, onProgress);
    let coverBlob: Blob | null = null;
    const coverUrl = service.getCoverUrl(item.id);
    if (coverUrl) {
       try { coverBlob = await service.downloadFile(coverUrl); } catch (e) { console.warn("Cover download failed", e); }
    }
    const rawItem = this.deepClone(item);
    await db.downloads.put({
      itemId: rawItem.id,
      blob: audioBlob,
      coverBlob,
      metadata: rawItem,
      downloadedAt: Date.now()
    });
  }

  static async getBook(itemId: string) { return db.downloads.get(itemId); }
  static async removeBook(itemId: string) { return db.downloads.delete(itemId); }
  static async isDownloaded(itemId: string): Promise<boolean> {
    if (!itemId) return false;
    return (await db.downloads.where('itemId').equals(itemId).count()) > 0;
  }
  static async getCoverUrl(itemId: string): Promise<string | null> {
    const book = await db.downloads.get(itemId);
    if (book && book.coverBlob) return URL.createObjectURL(book.coverBlob);
    return null;
  }
  static async getAllDownloadedBooks(): Promise<ABSLibraryItem[]> {
    const records = await db.downloads.toArray();
    return records.sort((a, b) => b.downloadedAt - a.downloadedAt).map(r => r.metadata);
  }

  // --- Wishlist Methods ---
  static async toggleWishlist(item: ABSLibraryItem): Promise<boolean> {
    const existing = await db.wishlist.get(item.id);
    if (existing) {
      await db.wishlist.delete(item.id);
      return false;
    } else {
      await db.wishlist.put({
        itemId: item.id,
        metadata: this.deepClone(item),
        addedAt: Date.now()
      });
      return true;
    }
  }

  static async isWishlisted(itemId: string): Promise<boolean> {
    if (!itemId) return false;
    return (await db.wishlist.where('itemId').equals(itemId).count()) > 0;
  }

  static async getAllWishlisted(): Promise<ABSLibraryItem[]> {
    const records = await db.wishlist.toArray();
    return records.sort((a, b) => b.addedAt - a.addedAt).map(r => r.metadata);
  }
}
