import { ABSUser, ABSLibraryItem, ABSProgress, ABSPlaybackSession, ABSSeries } from '../types';
import { io, Socket } from 'socket.io-client';

export interface LibraryQueryParams {
  limit?: number;
  offset?: number;
  sort?: string;
  desc?: number;
  filter?: string;
  search?: string;
}

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

  static normalizeUrl(url: string): string {
    let clean = url.trim().replace(/\/+$/, '');
    clean = clean.replace(/\/api\/?$/, '');
    
    if (clean && !clean.startsWith('http')) {
      const protocol = window.location.protocol === 'https:' ? 'https://' : 'http://';
      clean = `${protocol}${clean}`;
    }
    return clean;
  }

  /**
   * Helper to ensure URL segments are joined without double slashes
   */
  static cleanUrl(base: string, path: string): string {
    const sanitizedBase = base.replace(/\/+$/, '');
    const sanitizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${sanitizedBase}${sanitizedPath}`;
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

  private static async fetchWithRetry(url: string, options: RequestInit, retries = 2, timeout = 5000): Promise<Response> {
    let lastError: Error | null = null;
    for (let i = 0; i < retries; i++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        
        // Validation: Catch HTML redirects early (usually triggered by auth failure or bad URL)
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
          throw new TypeError("Oops, we got HTML! Check if the API URL or Token is correct.");
        }

        if (response.ok || (response.status >= 400 && response.status < 500)) return response;
        throw new Error(`SERVER_ERROR_${response.status}`);
      } catch (e: any) {
        clearTimeout(id);
        lastError = e;
        if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
      }
    }
    throw lastError || new Error('FAILED_AFTER_RETRIES');
  }

  static async login(serverUrl: string, username: string, password: string): Promise<any> {
    const baseUrl = this.normalizeUrl(serverUrl);
    const loginUrl = this.cleanUrl(baseUrl, '/login');
    const response = await this.fetchWithRetry(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password: password || '' }),
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data || `Login failed: ${response.status}`);
    }
    return data;
  }

  static async authorize(serverUrl: string, token: string): Promise<any> {
    const baseUrl = this.normalizeUrl(serverUrl);
    const authUrl = this.cleanUrl(baseUrl, '/api/authorize');
    const response = await this.fetchWithRetry(authUrl, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json' 
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data || 'Authorization failed');
    }
    return data;
  }

  private async fetchApi(endpoint: string, options: RequestInit = {}) {
    const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const url = ABSService.cleanUrl(this.serverUrl, path);
    
    try {
      const response = await ABSService.fetchWithRetry(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers,
        },
      });
      if (!response.ok) return null;
      
      const text = await response.text();
      if (text.trim() === 'OK') return 'OK';
      
      try {
        return JSON.parse(text);
      } catch (e) {
        return text;
      }
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

  async ensureLibraryId(): Promise<string> {
    if (this.libraryId) return this.libraryId;
    const data = await this.fetchApi('/libraries');
    const libraries = data?.libraries || data || [];
    const audioLibrary = libraries.find((l: any) => l.mediaType === 'audiobook') || libraries[0];
    this.libraryId = audioLibrary?.id;
    return this.libraryId!;
  }

  async getLibraryItemsPaged(params: LibraryQueryParams): Promise<{ results: ABSLibraryItem[], total: number }> {
    const libId = await this.ensureLibraryId();
    if (!libId) return { results: [], total: 0 };
    
    const query = new URLSearchParams();
    if (params.limit) query.append('limit', params.limit.toString());
    if (params.offset) query.append('offset', params.offset.toString());
    if (params.sort) query.append('sort', params.sort);
    if (params.desc !== undefined) query.append('desc', params.desc.toString());
    if (params.filter) query.append('filter', params.filter);
    if (params.search) query.append('search', params.search);
    query.append('include', 'progress');

    const data = await this.fetchApi(`/libraries/${libId}/items?${query.toString()}`);
    return {
      results: data?.results || (Array.isArray(data) ? data : []),
      total: typeof data?.total === 'number' ? data.total : (Array.isArray(data) ? data.length : 0)
    };
  }

  async getLibrarySeriesPaged(params: LibraryQueryParams): Promise<{ results: ABSSeries[], total: number }> {
    const libId = await this.ensureLibraryId();
    if (!libId) return { results: [], total: 0 };

    const query = new URLSearchParams();
    if (params.limit) query.append('limit', params.limit.toString());
    if (params.offset) query.append('offset', params.offset.toString());
    const sort = params.sort === 'addedAt' ? 'addedDate' : params.sort;
    if (sort) query.append('sort', sort);
    if (params.desc !== undefined) query.append('desc', params.desc.toString());
    query.append('include', 'books'); 

    const data = await this.fetchApi(`/libraries/${libId}/series?${query.toString()}`);
    
    let results = [];
    if (data?.results) results = data.results;
    else if (data?.series) results = data.series;
    else if (Array.isArray(data)) results = data;

    let total = 0;
    if (typeof data?.total === 'number') total = data.total;
    else if (typeof data?.totalSeries === 'number') total = data.totalSeries;
    else total = results.length;

    return { results, total };
  }

  async getShelves(): Promise<any[]> {
    const libId = await this.ensureLibraryId();
    if (!libId) return [];
    const data = await this.fetchApi(`/libraries/${libId}/shelves`);
    return Array.isArray(data) ? data : (data?.shelves || []);
  }

  async scanLibrary(): Promise<boolean> {
    const libId = await this.ensureLibraryId();
    if (!libId) return false;
    const data = await this.fetchApi(`/libraries/${libId}/scan`, { method: 'POST' });
    return data === 'OK' || !!data;
  }

  async getSeriesItems(seriesId: string): Promise<ABSLibraryItem[]> {
    const libId = await this.ensureLibraryId();
    const data = await this.fetchApi(`/libraries/${libId}/series/${seriesId}?include=progress`);
    return data?.books || data?.results || [];
  }

  async getProgress(itemId: string): Promise<ABSProgress | null> {
    return this.fetchApi(`/me/progress/${itemId}`);
  }

  async saveProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
    const progress = duration > 0 ? currentTime / duration : 0;
    await this.fetchApi(`/me/progress/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        currentTime,
        duration,
        progress,
        isFinished: progress >= 0.99
      })
    });
  }

  async startPlaybackSession(itemId: string, deviceInfo: any, supportedMimeTypes: string[], forceTranscode = false): Promise<ABSPlaybackSession | null> {
    const payload = {
      deviceInfo,
      supportedMimeTypes,
      mediaPlayer: 'html5',
      forceTranscode,
      forceDirectPlay: false
    };
    return this.fetchApi(`/items/${itemId}/play`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async syncSession(sessionId: string, timeListened: number, currentTime: number): Promise<void> {
    await this.fetchApi(`/session/${sessionId}/sync`, {
      method: 'POST',
      body: JSON.stringify({ timeListened, currentTime })
    });
  }

  async closeSession(sessionId: string, syncData?: { timeListened: number, currentTime: number }): Promise<void> {
    await this.fetchApi(`/session/${sessionId}/close`, {
      method: 'POST',
      body: syncData ? JSON.stringify(syncData) : undefined
    });
  }

  getCoverUrl(itemId: string): string {
    if (!itemId) return '';
    return ABSService.cleanUrl(this.serverUrl, `/api/items/${itemId}/cover?token=${this.token}`);
  }

  onProgressUpdate(callback: (progress: ABSProgress) => void) {
    this.socket?.on('user_item_progress_updated', (data) => {
      if (data && data.itemId) callback(data);
    });
  }

  onLibraryUpdate(callback: () => void) {
    this.socket?.on('item_added', callback);
    this.socket?.on('item_removed', callback);
    this.socket?.on('series_updated', callback);
  }

  disconnect() {
    this.socket?.disconnect();
  }
}