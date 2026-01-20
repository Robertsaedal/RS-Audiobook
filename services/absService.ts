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

const SERVER_URL = 'https://api.robertsaedal.xyz';
const BASE_API_URL = `${SERVER_URL}/api`;
const HARDCODED_LIBRARY_ID = 'a5706742-ccbf-452a-8b7d-822988dd5f63';

export class ABSService {
  private serverUrl: string;
  private token: string;
  private userId: string | null = null;
  private libraryId: string = HARDCODED_LIBRARY_ID;
  private socket: Socket | null = null;

  constructor(serverUrl: string, token: string, userId?: string) {
    this.serverUrl = SERVER_URL;
    this.token = typeof token === 'string' ? token.replace(/^Bearer\s+/i, '').trim() : '';
    this.userId = userId || null;
    this.initSocket();
  }

  static normalizeUrl(url: string): string {
    return SERVER_URL;
  }

  private initSocket() {
    this.socket = io(SERVER_URL, {
      auth: { token: this.token },
      path: '/socket.io',
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      timeout: 10000,
    });
  }

  private static async fetchWithRetry(url: string, options: RequestInit, retries = 3, timeout = 10000): Promise<Response> {
    let lastError: Error | null = null;
    for (let i = 0; i < retries; i++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const absoluteUrl = url.startsWith('http') ? url : `${BASE_API_URL}${url.startsWith('/') ? url : `/${url}`}`;
        const response = await fetch(absoluteUrl, { ...options, signal: controller.signal });
        clearTimeout(id);
        
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("text/html") && !url.includes('/login')) {
          throw new TypeError("Authorization check failed: Server returned HTML.");
        }

        if (response.ok || (response.status >= 400 && response.status < 500)) return response;
        throw new Error(`SERVER_ERROR_${response.status}`);
      } catch (e: any) {
        clearTimeout(id);
        lastError = e;
        // Increase delay between retries to handle transient protocol errors
        if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, 800 * (i + 1)));
      }
    }
    throw lastError || new Error('FAILED_AFTER_RETRIES');
  }

  static async login(serverUrl: string, username: string, password: string): Promise<any> {
    const loginUrl = `${SERVER_URL}/login`;
    const response = await this.fetchWithRetry(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password: password || '' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data || `Login failed: ${response.status}`);
    return data;
  }

  static async authorize(serverUrl: string, token: string): Promise<any> {
    const authUrl = `${BASE_API_URL}/authorize`;
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    const response = await this.fetchWithRetry(authUrl, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${cleanToken}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data || 'Authorization failed');
    return data;
  }

  private async fetchApi(endpoint: string, options: RequestInit = {}) {
    const path = endpoint.startsWith('/api/') ? endpoint.substring(4) : endpoint;
    const url = `${BASE_API_URL}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const response = await ABSService.fetchWithRetry(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      if (!response.ok) return null;
      const text = await response.text();
      try { return JSON.parse(text); } catch { return text; }
    } catch (e) {
      return null;
    }
  }

  async getLibraryItemsPaged(params: LibraryQueryParams): Promise<{ results: ABSLibraryItem[], total: number }> {
    const query = new URLSearchParams();
    const limit = params.limit || 60;
    const offset = params.offset || 0;
    
    query.append('limit', limit.toString());
    query.append('offset', offset.toString());
    
    const page = Math.floor(offset / limit);
    query.append('page', page.toString());
    
    let sort = params.sort || 'addedAt';
    if (sort === 'addedAt') query.append('sort', 'addedAt');
    else if (sort === 'updatedAt') query.append('sort', 'updatedAt');
    else if (sort.includes('title')) query.append('sort', 'media.metadata.title');
    else if (sort.includes('author')) query.append('sort', 'media.metadata.authorName');
    else query.append('sort', sort);

    const desc = params.desc !== undefined ? params.desc : (sort === 'addedAt' ? 1 : 0);
    query.append('desc', desc.toString());
    
    if (params.filter) query.append('filter', params.filter);
    if (params.search) query.append('search', params.search);
    
    query.append('include', 'progress,metadata');
    query.append('_cb', Date.now().toString());

    const data = await this.fetchApi(`/libraries/${HARDCODED_LIBRARY_ID}/items?${query.toString()}`);
    const results = data?.results || data?.items || (Array.isArray(data) ? data : []);
    const total = data?.total ?? data?.totalItems ?? data?.count ?? results.length;
    
    return { results, total };
  }

  async getPersonalizedShelves(params?: { limit?: number }): Promise<any> {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', params.limit.toString());
    query.append('include', 'progress');
    query.append('_cb', Date.now().toString());
    return this.fetchApi(`/libraries/${HARDCODED_LIBRARY_ID}/personalized?${query.toString()}`);
  }

  async getItemsInProgress(): Promise<ABSLibraryItem[]> {
    const data = await this.fetchApi(`/me/items-in-progress?_cb=${Date.now()}`);
    return Array.isArray(data) ? data : (data?.results || []);
  }

  async getLibrarySeriesPaged(params: LibraryQueryParams): Promise<{ results: ABSSeries[], total: number }> {
    const query = new URLSearchParams();
    const limit = params.limit || 20;
    const offset = params.offset || 0;
    
    query.append('limit', limit.toString());
    query.append('offset', offset.toString());
    
    const page = Math.floor(offset / limit);
    query.append('page', page.toString());
    
    const sort = params.sort === 'addedAt' ? 'addedDate' : params.sort;
    if (sort) query.append('sort', sort);
    if (params.desc !== undefined) query.append('desc', params.desc.toString());
    
    // Add search support for series
    if (params.search) query.append('search', params.search);

    query.append('include', 'books'); 
    query.append('_cb', Date.now().toString());

    const data = await this.fetchApi(`/libraries/${HARDCODED_LIBRARY_ID}/series?${query.toString()}`);
    const results = data?.results || data?.series || data?.items || (Array.isArray(data) ? data : []);
    const total = data?.total ?? data?.totalSeries ?? data?.count ?? results.length;
    
    return { results, total };
  }

  async quickSearch(query: string): Promise<{ books: ABSLibraryItem[], series: ABSSeries[] }> {
    const q = new URLSearchParams();
    q.append('q', query);
    q.append('limit', '10');
    const data = await this.fetchApi(`/libraries/${HARDCODED_LIBRARY_ID}/search?${q.toString()}`);
    
    const books = (data?.book || []).map((b: any) => b.libraryItem);
    const series = (data?.series || []).map((s: any) => ({
      ...s.series,
      books: s.books || []
    }));
    
    return { books, series };
  }

  /**
   * Fetches listening stats from the server.
   * Matches ABS endpoint: /api/me/listening-stats
   */
  async getListeningStats(): Promise<{
    totalTime: number;
    days: Record<string, number>;
    recentSessions: any[];
  } | null> {
    const data = await this.fetchApi(`/me/listening-stats?_cb=${Date.now()}`);
    if (!data) return null;
    return data;
  }

  async scanLibrary(): Promise<boolean> {
    const data = await this.fetchApi(`/libraries/${HARDCODED_LIBRARY_ID}/scan`, { method: 'POST' });
    return data === 'OK' || !!data;
  }

  async getSeries(seriesId: string): Promise<ABSSeries | null> {
    const data = await this.fetchApi(`/libraries/${HARDCODED_LIBRARY_ID}/series/${seriesId}?include=books&_cb=${Date.now()}`);
    if (!data) return null;
    return data;
  }

  async getSeriesItems(seriesId: string): Promise<ABSLibraryItem[]> {
    const data = await this.fetchApi(`/libraries/${HARDCODED_LIBRARY_ID}/series/${seriesId}?include=progress&_cb=${Date.now()}`);
    return data?.books || data?.results || data?.items || [];
  }

  async getProgress(itemId: string): Promise<ABSProgress | null> {
    return this.fetchApi(`/me/progress/${itemId}?_cb=${Date.now()}`);
  }

  async saveProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
    const progress = duration > 0 ? currentTime / duration : 0;
    await this.fetchApi(`/me/progress/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ currentTime, duration, progress, isFinished: progress >= 0.99 })
    });
  }

  async updateProgress(itemId: string, payload: { isFinished: boolean }): Promise<void> {
    await this.fetchApi(`/me/progress/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  /**
   * Fallback for raw stats if needed, but getListeningStats is preferred.
   */
  async getUserStatsForYear(year: number): Promise<any> {
    // Redirect to main stats endpoint as it returns global stats
    return this.getListeningStats();
  }

  async startPlaybackSession(itemId: string, deviceInfo: any, supportedMimeTypes: string[], forceTranscode = false): Promise<ABSPlaybackSession | null> {
    const payload = { deviceInfo, supportedMimeTypes, mediaPlayer: 'html5', forceTranscode, forceDirectPlay: false };
    return this.fetchApi(`/items/${itemId}/play`, { method: 'POST', body: JSON.stringify(payload) });
  }

  async syncSession(sessionId: string, timeListened: number, currentTime: number): Promise<void> {
    await this.fetchApi(`/session/${sessionId}/sync`, { method: 'POST', body: JSON.stringify({ timeListened, currentTime }) });
  }

  async closeSession(sessionId: string, syncData?: { timeListened: number, currentTime: number }): Promise<void> {
    await this.fetchApi(`/session/${sessionId}/close`, { method: 'POST', body: syncData ? JSON.stringify(syncData) : undefined });
  }

  getCoverUrl(itemId: string): string {
    if (!itemId) return '';
    return `${BASE_API_URL}/items/${itemId}/cover?token=${this.token}`;
  }

  getDownloadUrl(itemId: string): string {
    if (!itemId) return '';
    return `${BASE_API_URL}/items/${itemId}/download?token=${this.token}`;
  }

  async downloadFile(url: string, onProgress?: (percentage: number) => void): Promise<Blob> {
    const headers: HeadersInit = {};
    if (this.token && !url.includes('token=')) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let loaded = 0;

    const reader = response.body?.getReader();
    if (!reader) throw new Error('ReadableStream not supported');

    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      if (value) {
        chunks.push(value);
        loaded += value.length;
        if (total > 0 && onProgress) {
          onProgress((loaded / total) * 100);
        }
      }
    }

    const blob = new Blob(chunks);
    return blob;
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