
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
  private userId: string | null = null;
  public libraryId: string | null = null;
  private socket: Socket | null = null;

  constructor(serverUrl: string, token: string, userId?: string, libraryId?: string) {
    // Ensure URL doesn't have trailing slash
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.token = typeof token === 'string' ? token.replace(/^Bearer\s+/i, '').trim() : '';
    this.userId = userId || null;
    this.libraryId = libraryId || null;
    this.initSocket();
  }

  static normalizeUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized.startsWith('http')) {
      normalized = `https://${normalized}`;
    }
    return normalized.replace(/\/$/, '');
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

    // CRITICAL: The server expects an explicit 'auth' event after connection.
    this.socket.on('connect', () => {
      console.log('[ABSService] Socket connected, authenticating...');
      this.emitAuth();
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[ABSService] Socket connection error:', err.message);
    });
  }

  public reconnect() {
    if (this.socket && this.socket.connected) return;
    this.disconnect();
    this.initSocket();
  }

  public emitAuth() {
    if (this.socket) {
      this.socket.emit('auth', this.token);
    }
  }

  public emitGetUserItems() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('get_user_items');
    }
  }

  private static async fetchWithRetry(url: string, options: RequestInit, retries = 3, timeout = 10000): Promise<Response> {
    let lastError: Error | null = null;
    for (let i = 0; i < retries; i++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
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
        if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
      }
    }
    throw lastError || new Error('FAILED_AFTER_RETRIES');
  }

  static async login(serverUrl: string, username: string, password: string): Promise<any> {
    const cleanUrl = this.normalizeUrl(serverUrl);
    const loginUrl = `${cleanUrl}/login`;
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
    const cleanUrl = this.normalizeUrl(serverUrl);
    const authUrl = `${cleanUrl}/api/authorize`;
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
    const url = `${this.serverUrl}/api${path.startsWith('/') ? path : `/${path}`}`;
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
      console.error(`Fetch error for ${url}:`, e);
      return null;
    }
  }

  async getLibraries(): Promise<any[]> {
    const data = await this.fetchApi('/libraries');
    return Array.isArray(data) ? data : (data?.libraries || []);
  }

  async getLibraryItemsPaged(params: LibraryQueryParams): Promise<{ results: ABSLibraryItem[], total: number }> {
    if (!this.libraryId) return { results: [], total: 0 };

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
    
    // Explicitly including 'series' and setting 'expanded' to ensure sequence data is returned
    query.append('include', 'progress,userProgress,metadata,series,media');
    query.append('expanded', '1');
    query.append('_cb', Date.now().toString());

    const data = await this.fetchApi(`/libraries/${this.libraryId}/items?${query.toString()}`);
    const results = data?.results || data?.items || (Array.isArray(data) ? data : []);
    const total = data?.total ?? data?.totalItems ?? data?.count ?? results.length;
    
    return { results, total };
  }

  async getPersonalizedShelves(params?: { limit?: number }): Promise<any> {
    if (!this.libraryId) return [];

    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', params.limit.toString());
    
    // Explicitly including 'series' and 'expanded' for shelves as well.
    // Ensure 'series' is definitely present to allow ID extraction on homepage items.
    query.append('include', 'progress,userProgress,metadata,series,media');
    query.append('expanded', '1');
    query.append('_cb', Date.now().toString());

    const url = `/libraries/${this.libraryId}/personalized?${query.toString()}`;

    let retries = 3;
    for (let i = 0; i < retries; i++) {
      try {
        const result = await this.fetchApi(url);
        if (result && (Array.isArray(result) || result.length !== undefined)) {
          return result;
        }
        throw new Error("Invalid response");
      } catch (e) {
        if (i === retries - 1) return [];
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    return [];
  }

  async getItemsInProgress(): Promise<ABSLibraryItem[]> {
    const data = await this.fetchApi(`/me/items-in-progress?include=progress,userProgress,metadata,series,media&expanded=1&_cb=${Date.now()}`);
    return Array.isArray(data) ? data : (data?.results || []);
  }

  async getAllUserProgress(): Promise<ABSProgress[]> {
    const data = await this.fetchApi(`/me/progress?_cb=${Date.now()}`);
    return data?.results || data?.progress || (Array.isArray(data) ? data : []);
  }

  async getLibrarySeriesPaged(params: LibraryQueryParams): Promise<{ results: ABSSeries[], total: number }> {
    if (!this.libraryId) return { results: [], total: 0 };

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
    
    if (params.search) query.append('search', params.search);

    query.append('include', 'books'); 
    query.append('_cb', Date.now().toString());

    const data = await this.fetchApi(`/libraries/${this.libraryId}/series?${query.toString()}`);
    const results = data?.results || data?.series || data?.items || (Array.isArray(data) ? data : []);
    const total = data?.total ?? data?.totalSeries ?? data?.count ?? results.length;
    
    return { results, total };
  }

  async quickSearch(query: string): Promise<{ books: ABSLibraryItem[], series: ABSSeries[] }> {
    if (!this.libraryId) return { books: [], series: [] };

    const q = new URLSearchParams();
    q.append('q', query);
    q.append('limit', '10');
    // Ensure expanded metadata for search results
    q.append('include', 'metadata,series,media,userProgress');
    q.append('expanded', '1');
    const data = await this.fetchApi(`/libraries/${this.libraryId}/search?${q.toString()}`);
    
    const books = (data?.book || []).map((b: any) => b.libraryItem);
    const series = (data?.series || []).map((s: any) => ({
      ...s.series,
      books: s.books || []
    }));
    
    return { books, series };
  }

  async getListeningStats(): Promise<{
    totalTime: number;
    days: Record<string, number>;
    recentSessions: any[];
  } | null> {
    const data = await this.fetchApi(`/me/listening-stats?_cb=${Date.now()}`);
    if (!data) return { totalTime: 0, days: {}, recentSessions: [] }; 
    return data;
  }

  async scanLibrary(): Promise<boolean> {
    if (!this.libraryId) return false;
    const data = await this.fetchApi(`/libraries/${this.libraryId}/scan`, { method: 'POST' });
    return data === 'OK' || !!data;
  }

  async getSeries(seriesId: string): Promise<ABSSeries | null> {
    if (!this.libraryId) return null;
    const data = await this.fetchApi(`/libraries/${this.libraryId}/series/${seriesId}?include=books,progress,rssfeed&_cb=${Date.now()}`);
    if (!data) return null;
    return data;
  }

  async getSeriesBooks(seriesId: string, seriesName?: string): Promise<ABSLibraryItem[]> {
    if (!this.libraryId) return [];

    try {
        const seriesData = await this.getSeries(seriesId);
        if (seriesData && Array.isArray(seriesData.books) && seriesData.books.length > 0) {
            return seriesData.books;
        }
    } catch (e) {
        console.warn('Series endpoint fetch failed, trying filter fallback', e);
    }

    const tryFilters = [`series.id.eq.${seriesId}`, `series.eq.${seriesId}`];
    
    try {
      if (typeof btoa === 'function') {
        const b64Id = btoa(seriesId);
        tryFilters.push(`series.${b64Id}`);
      }
    } catch (e) {}

    if (seriesName) {
      tryFilters.push(`series.name.eq.${seriesName}`);
    }

    for (const filter of tryFilters) {
        try {
          const response = await this.getLibraryItemsPaged({
            limit: 500,
            filter: filter,
            sort: 'series.sequence',
            desc: 0
          });
          if (response && response.results.length > 0) {
            return response.results;
          }
        } catch (e) {}
    }

    console.warn(`[ABSService] Could not find books for series ${seriesId} (Name: ${seriesName})`);
    return [];
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

  async getUserStatsForYear(year: number): Promise<any> {
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
    return `${this.serverUrl}/api/items/${itemId}/cover?token=${this.token}`;
  }

  getDownloadUrl(itemId: string): string {
    if (!itemId) return '';
    return `${this.serverUrl}/api/items/${itemId}/download?token=${this.token}`;
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

  // Socket Event Listeners

  onInit(callback: (data: any) => void) {
    this.socket?.on('init', callback);
  }

  onUserOnline(callback: (data: any) => void) {
    this.socket?.on('user_online', (payload: any) => {
      if (payload && payload.session && payload.session.libraryItemId) {
         callback({
             itemId: payload.session.libraryItemId,
             currentTime: payload.session.currentTime,
             duration: payload.session.duration || 0,
             progress: (payload.session.duration > 0) ? (payload.session.currentTime / payload.session.duration) : 0,
             isFinished: false,
             lastUpdate: Date.now()
         });
      }
    });
  }

  onProgressUpdate(callback: (progress: ABSProgress) => void) {
    this.socket?.on('user_item_progress_updated', (payload: any) => {
      const data = payload.data || payload; 
      const itemId = data.libraryItemId || data.itemId;

      if (itemId) {
        callback({
          itemId,
          currentTime: data.currentTime,
          duration: data.duration,
          progress: data.progress,
          isFinished: data.isFinished,
          lastUpdate: data.lastUpdate || Date.now(),
          hideFromContinueListening: data.hideFromContinueListening
        });
      }
    });
  }

  onProgressDelete(callback: (itemId: string) => void) {
    this.socket?.on('user_item_progress_removed', (data) => {
      if (data && (data.itemId || data.libraryItemId)) {
        callback(data.itemId || data.libraryItemId);
      }
    });
    this.socket?.on('user_item_progress_deleted', (data) => {
      if (data && (data.itemId || data.libraryItemId)) {
        callback(data.itemId || data.libraryItemId);
      }
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
