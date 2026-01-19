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

  private static normalizeUrl(url: string): string {
    let clean = url.trim().replace(/\/+$/, '');
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
        
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          return response;
        }
        
        throw new Error(`SERVER_ERROR_${response.status}`);
      } catch (e: any) {
        clearTimeout(id);
        lastError = e;
        if (e.name === 'AbortError') console.warn(`Attempt ${i + 1} timed out for ${url}`);
        if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
      }
    }
    
    throw lastError || new Error('FAILED_AFTER_RETRIES');
  }

  static async login(serverUrl: string, username: string, password: string): Promise<any> {
    const baseUrl = this.normalizeUrl(serverUrl);
    // Specifically /login without /api as per latest server configuration
    const loginUrl = `${baseUrl}/login`;
    
    try {
      const response = await this.fetchWithRetry(loginUrl, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include', 
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          username: username.trim(), 
          password: password 
        }),
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

  private async fetchApi(endpoint: string, options: RequestInit = {}) {
    const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const url = `${this.serverUrl}${path}`;
    
    try {
      const response = await ABSService.fetchWithRetry(url, {
        ...options,
        mode: 'cors',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
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
   * Reverted to /api/me/progress/:id as /api/users/me/progress was returning 404
   */
  async getProgress(itemId: string): Promise<ABSProgress | null> {
    return this.fetchApi(`/me/progress/${itemId}`);
  }

  async ensureLibraryId(): Promise<string> {
    if (this.libraryId) return this.libraryId;
    const data = await this.fetchApi('/libraries');
    const libraries = data?.libraries || data || [];
    const audioLibrary = libraries.find((l: any) => l.mediaType === 'audiobook') || libraries[0];
    this.libraryId = audioLibrary?.id;
    return this.libraryId!;
  }

  async getLibraryItems(): Promise<ABSLibraryItem[]> {
    const libId = await this.ensureLibraryId();
    if (!libId) return [];
    const data = await this.fetchApi(`/libraries/${libId}/items?include=progress`);
    return data?.results || data || [];
  }

  async getItemDetails(id: string): Promise<ABSLibraryItem> {
    return this.fetchApi(`/items/${id}?include=progress`);
  }

  async startPlaybackSession(itemId: string): Promise<any> {
    return this.fetchApi(`/items/${itemId}/play`, { method: 'POST' });
  }

  async saveProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
    const progressData = {
      currentTime,
      progress: duration > 0 ? currentTime / duration : 0,
      isFinished: currentTime >= duration - 10 && duration > 0
    };
    try {
      // Reverted to /api/me/progress/:id
      await ABSService.fetchWithRetry(`${this.serverUrl}/api/me/progress/${itemId}`, {
        method: 'PATCH',
        mode: 'cors',
        credentials: 'include',
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

  getHlsStreamUrl(itemId: string): string {
    return `${this.serverUrl}/hls/${itemId}?token=${this.token}`;
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