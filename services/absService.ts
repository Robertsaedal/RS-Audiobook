import { ABSUser, ABSLibraryItem, ABSProgress } from '../types';
import { io, Socket } from 'socket.io-client';

export class ABSService {
  private serverUrl: string;
  private token: string;
  private libraryId: string | null = null;
  private socket: Socket | null = null;

  constructor(serverUrl: string, token: string) {
    this.serverUrl = ABSService.normalizeUrl(serverUrl);
    this.token = token;
    this.initSocket();
  }

  /**
   * Cleans and normalizes the server URL, stripping trailing slashes
   * and ensuring the /api segment is managed by the service methods.
   */
  private static normalizeUrl(url: string): string {
    let clean = url.trim().replace(/\/+$/, '');
    
    // Specifically remove /api or /api/ if the user included it
    clean = clean.replace(/\/api\/?$/, '');
    
    if (clean && !clean.startsWith('http')) {
      const protocol = window.location.protocol === 'https:' ? 'https://' : 'http://';
      clean = `${protocol}${clean}`;
    }
    return clean;
  }

  private initSocket() {
    this.socket = io(this.serverUrl, {
      auth: { token: this.token },
      path: '/socket.io',
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      timeout: 10000,
    });
  }

  /**
   * Enhanced fetch with 5s timeout and 3 retries for high availability.
   */
  private static async fetchWithRetry(url: string, options: RequestInit, retries = 3, timeout = 5000): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < retries; i++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(id);
        
        // Return if successful or a standard client error (e.g. 401, 404, 403)
        // We only retry on network failures or 5xx server errors
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          return response;
        }
        
        throw new Error(`SERVER_ERROR_${response.status}`);
      } catch (e: any) {
        clearTimeout(id);
        lastError = e;
        
        // If it's an abort, it's a timeout
        if (e.name === 'AbortError') {
          console.warn(`Attempt ${i + 1} timed out for ${url}`);
        }
        
        if (i < retries - 1) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
        }
      }
    }
    
    throw lastError || new Error('FAILED_AFTER_RETRIES');
  }

  static async login(serverUrl: string, username: string, password: string): Promise<any> {
    const baseUrl = this.normalizeUrl(serverUrl);
    try {
      const response = await this.fetchWithRetry(`${baseUrl}/login`, {
        method: 'POST',
        mode: 'cors',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Login failed: ${response.status}`);
      }
      return response.json();
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'FAILED_AFTER_RETRIES') {
        throw new Error('Archive sync timed out. Check your link.');
      }
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') throw new Error('CORS_ERROR');
      throw err;
    }
  }

  /**
   * Standard fetch utility for all API calls
   */
  private async fetchApi(endpoint: string, options: RequestInit = {}) {
    // Ensure we don't double up on slashes
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.serverUrl}${path}`;
    
    try {
      const response = await ABSService.fetchWithRetry(url, {
        ...options,
        mode: 'cors',
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (response.status === 404) return null;
      if (!response.ok) return null;
      
      return response.json();
    } catch (e) {
      console.error(`API Fetch Error: ${endpoint}`, e);
      return null;
    }
  }

  normalizeDate(date: string | number | undefined): number {
    if (!date) return 0;
    if (typeof date === 'number') return date;
    const parsed = Date.parse(date);
    return isNaN(parsed) ? (parseInt(date, 10) || 0) : parsed;
  }

  /**
   * Fetches user progress. Returns null if not found (404), which allows the 
   * player to default to 0.
   */
  async getProgress(itemId: string): Promise<ABSProgress | null> {
    // Standard Audiobookshelf path is /api/me/progress/:id
    return this.fetchApi(`/api/me/progress/${itemId}`);
  }

  async ensureLibraryId(): Promise<string> {
    if (this.libraryId) return this.libraryId;
    const data = await this.fetchApi('/api/libraries');
    const libraries = data?.libraries || data || [];
    const audioLibrary = libraries.find((l: any) => l.mediaType === 'audiobook') || libraries[0];
    this.libraryId = audioLibrary?.id;
    return this.libraryId!;
  }

  async getLibraryItems(): Promise<ABSLibraryItem[]> {
    const libId = await this.ensureLibraryId();
    if (!libId) return [];
    const data = await this.fetchApi(`/api/libraries/${libId}/items?include=progress`);
    return data?.results || data || [];
  }

  async getItemDetails(id: string): Promise<ABSLibraryItem> {
    return this.fetchApi(`/api/items/${id}?include=progress`);
  }

  async startPlaybackSession(itemId: string): Promise<any> {
    return this.fetchApi(`/api/items/${itemId}/play`, { method: 'POST' });
  }

  async saveProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
    const progressData = {
      currentTime,
      progress: duration > 0 ? currentTime / duration : 0,
      isFinished: currentTime >= duration - 10 && duration > 0
    };
    try {
      await ABSService.fetchWithRetry(`${this.serverUrl}/api/me/progress/${itemId}`, {
        method: 'PATCH',
        mode: 'cors',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(progressData),
      });
    } catch (e) {
      console.warn("Progress sync failed", e);
    }
  }

  getCoverUrl(itemId: string): string {
    return `${this.serverUrl}/api/items/${itemId}/cover?token=${this.token}`;
  }

  onProgressUpdate(callback: (progress: ABSProgress) => void) {
    this.socket?.on('user_item_progress_updated', (data) => {
      if (data && data.itemId) callback(data);
    });
  }

  onLibraryUpdate(callback: () => void) {
    this.socket?.on('item_added', callback);
    this.socket?.on('item_removed', callback);
  }

  disconnect() {
    this.socket?.disconnect();
  }
}
