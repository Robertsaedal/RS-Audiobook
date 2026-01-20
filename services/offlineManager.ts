import { db } from './db';
import { ABSService } from './absService';
import { ABSLibraryItem } from '../types';

export class OfflineManager {
  static async saveBook(
    service: ABSService, 
    item: ABSLibraryItem, 
    onProgress?: (p: number) => void
  ) {
    // 1. Get download URL (Service appends token)
    const downloadUrl = service.getDownloadUrl(item.id);
    
    // 2. Download Audio
    const audioBlob = await service.downloadFile(downloadUrl, onProgress);
    
    // 3. Download Cover
    let coverBlob: Blob | null = null;
    const coverUrl = service.getCoverUrl(item.id);
    if (coverUrl) {
       try {
         coverBlob = await service.downloadFile(coverUrl);
       } catch (e) { 
         console.warn("Cover download failed", e); 
       }
    }

    // 4. Save to DB
    await db.downloads.put({
      itemId: item.id,
      blob: audioBlob,
      coverBlob,
      metadata: item,
      downloadedAt: Date.now()
    });
  }

  static async getBook(itemId: string) {
    return db.downloads.get(itemId);
  }

  static async removeBook(itemId: string) {
    return db.downloads.delete(itemId);
  }

  static async isDownloaded(itemId: string): Promise<boolean> {
    if (!itemId) return false;
    const count = await db.downloads.where('itemId').equals(itemId).count();
    return count > 0;
  }
  
  static async getCoverUrl(itemId: string): Promise<string | null> {
    const book = await db.downloads.get(itemId);
    if (book && book.coverBlob) {
      return URL.createObjectURL(book.coverBlob);
    }
    return null;
  }
}