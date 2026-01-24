
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
  private socketErrorCount = 0; // Circuit Breaker Counter

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
    // CIRCUIT BREAKER: If we failed too many times, stop trying.
    if (this.socketErrorCount > 3) {
      console.warn('[ABSService] Socket circuit breaker active. Live updates disabled.');
      return;
    }

    this.socket = io(this.serverUrl, {
      auth: { token: this.token },
      path: '/socket.io',
      transports: ['websocket'], // Fixed: Force WebSocket only
      upgrade: false, // Fixed: Disable polling upgrade mechanism
      autoConnect: true,
      reconnection: true,
      timeout: 10000,
      forceNew: true // Force new session to avoid sticky-session 400 errors
    });

    // CRITICAL: The server expects an explicit 'auth' event after connection.
    this.socket.on('connect', () => {
      console.log('[ABSService] Socket connected (WebSocket), authenticating...');
      this.socketErrorCount = 0; // Reset on successful connect
      this.emitAuth();
    });

    this.socket.on('connect_error', (err) => {
      this.socketErrorCount++;
      if (this.socketErrorCount > 3) {
        console.warn('[ABSService] Too many socket errors. Disconnecting permanently.', err.message);
        this.socket?.disconnect();
        this.socket = null;
      } else {
        console.warn(`[ABSService] Socket Error (${this.socketErrorCount}/3):`, err.message);
      }
    });
  }

  public reconnect() {
    if (this.socketErrorCount > 3) return; // Respect circuit breaker
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

  private static async fetchWithRetry(url: string, options: RequestInit, retries = 3, timeout = 60000): Promise<Response> {
    console.log(`[Network] Starting Request: ${url}`);
    let lastError: Error | null = null;
    
    // CORS FIX: Removed custom Cache-Control headers AND cache: 'no-store'.
    // We rely SOLELY on the URL timestamp (_cb) to bypass cache.
    // 'no-store' can trigger strict CORS preflight checks that fail on some servers.
    const headers = { ...options.headers };

    // Append Cache Buster to URL automatically
    const separator = url.includes('?') ? '&' : '?';
    const cleanUrl = `${url}${separator}_cb=${Date.now()}`;

    const newOptions = { 
      ...options, 
      headers
      // cache: 'default' // Let browser handle it, query param busts it anyway
    };

    for (let i = 0; i < retries; i++) {
      console.log(`[Network] Attempt ${i + 1}/${retries} for ${url}`);
      
      const controller = new AbortController();
      // Only set timeout if not keepalive
      const id = options.keepalive ? null : setTimeout(() => {
        console.error(`[Network] TIMEOUT REACHED (${timeout}ms) for ${url}`);
        controller.abort(new Error("Network timeout: Server took too long to respond"));
      }, timeout);
      
      try {
        const response = await fetch(cleanUrl, { ...newOptions, signal: controller.signal });
        if (id) clearTimeout(id);
        
        console.log(`[Network] Response ${response.status} ${response.statusText} for ${url}`);

        const contentType = response.headers.get("content-type");
        // API responses should NEVER be HTML. If they are, it's usually a 404 page or proxy error.
        if (contentType && contentType.includes("text/html")) {
          console.error(`[Network] Invalid Content-Type: Received HTML instead of JSON for ${url}`);
          throw new TypeError("Authorization check failed: Server returned HTML (Web Page) instead of JSON (API).");
        }

        if (response.ok || (response.status >= 400 && response.status < 500)) return response;
        
        console.error(`[Network] Server Error: ${response.status}`);
        throw new Error(`SERVER_ERROR_${response.status}`);
      } catch (e: any) {
        if (id) clearTimeout(id);
        lastError = e;
        
        if (e.name === 'AbortError') {
             console.warn(`[Network] Request aborted/timed out: ${url}`);
        } else {
             console.error(`[Network] Exception during fetch for ${url}:`, e);
        }

        if (options.keepalive || i === retries - 1) break;
        
        const delay = 1000 * (i + 1);
        console.log(`[Network] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay)); 
      }
    }
    
    console.error(`[Network] FAILED after ${retries} attempts: ${url}`);
    throw lastError || new Error('FAILED_AFTER_RETRIES');
  }

  static async login(serverUrl: string, username: string, password: string): Promise<any> {
    console.log(`[Login] Initiating login for user '${username}' at '${serverUrl}'`);
    
    // Mixed Content Check: Warn if trying to access HTTP from HTTPS
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && serverUrl.trim().startsWith('http:')) {
         console.error("[Login] SECURITY BLOCK: You are on a secure site (HTTPS) trying to connect to an insecure server (HTTP). Browsers block this.");
    }

    const cleanUrl = this.normalizeUrl(serverUrl);
    
    // Strategy: Try /login first (Standard), then /api/login (Proxy/Custom)
    const candidates = [`${cleanUrl}/login`, `${cleanUrl}/api/login`];
    let lastError: any = null;

    for (const url of candidates) {
        try {
            console.log(`[Login] Attempting connection to: ${url}`);
            
            // 0 retries (1 attempt) per endpoint to fail fast
            // INCREASED TIMEOUT: 30 seconds for initial login candidate
            const response = await this.fetchWithRetry(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: username.trim(), password: password || '' }),
            }, 0, 30000); 
            
            if (!response.ok) {
                // If 404, it might be the wrong endpoint, loop to next
                if (response.status === 404) {
                    throw new Error("404 Not Found");
                }
                
                // If 401/403, we found the server but credentials are wrong. 
                // Stop trying other endpoints.
                if (response.status === 401 || response.status === 403) {
                     const data = await response.json().catch(() => ({ error: 'Invalid Credentials' }));
                     throw new Error(typeof data === 'string' ? data : (data.error || 'Invalid Credentials'));
                }
                
                throw new Error(`Server returned status ${response.status}`);
            }
            
            // Double check content type before parsing
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("text/html")) {
                throw new Error("Endpoint returned HTML (Likely Web UI, not API)");
            }

            const data = await response.json();
            console.log(`[Login] Success! Connected via ${url}`);
            return data;

        } catch (e: any) {
            console.warn(`[Login] Failed at ${url}:`, e.message);
            lastError = e;

            // Stop chain if we know it's a credential issue
            if (e.message && (e.message.includes('Invalid') || e.message.includes('401') || e.message.includes('403'))) {
                throw e;
            }
        }
    }
    
    console.error("[Login] All connection attempts failed.");
    throw lastError || new Error("Connection failed. Check Server URL and ensure it is accessible.");
  }

  static async authorize(serverUrl: string, token: string): Promise<any> {
    console.log(`[Auth] Authorizing token at ${serverUrl}`);
    const cleanUrl = this.normalizeUrl(serverUrl);
    const authUrl = `${cleanUrl}/api/authorize`;
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    
    try {
      const response = await this.fetchWithRetry(authUrl, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`[Auth] Response Status: ${response.status}`);
      const data = await response.json();
      
      if (!response.ok) {
          console.error(`[Auth] Failed:`, data);
          throw new Error(data || 'Authorization failed');
      }
      
      console.log(`[Auth] Success!`);
      return data;
    } catch (e) {
      console.error(`[Auth] CRITICAL FAILURE:`, e);
      throw e;
    }
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
      
      // Handle explicit HTTP errors here for better debugging
      if (!response.ok) {
        if (response.status === 401) throw new Error("Unauthorized");
        if (response.status === 403) throw new Error("Forbidden");
        if (response.status === 404) throw new Error("Not Found");
        if (response.status >= 500) throw new Error(`Server Error ${response.status}`);
        return null;
      }

      const text = await response.text();
      try { return JSON.parse(text); } catch { return text; }
    } catch (e) {
      console.error(`Fetch error for ${url}:`, e);
      throw e; // Re-throw to caller for handling
    }
  }

  async getLibraries(): Promise<any[]> {
    const data = await this.fetchApi('/libraries');
    return Array.isArray(data) ? data : (data?.libraries || []);
  }

  async getLibraryItem(itemId: string): Promise<ABSLibraryItem | null> {
    if (!this.libraryId) return null;
    const data = await this.fetchApi(`/libraries/${this.libraryId}/items/${itemId}?include=progress,userProgress,metadata,series,media,authors&expanded=1`);
    return data;
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
    
    query.append('include', 'progress,userProgress,metadata,series,media');
    query.append('expanded', '1');

    const data = await this.fetchApi(`/libraries/${this.libraryId}/items?${query.toString()}`);
    const results = data?.results || data?.items || (Array.isArray(data) ? data : []);
    const total = data?.total ?? data?.totalItems ?? data?.count ?? results.length;
    
    return { results, total };
  }

  async getPersonalizedShelves(params?: { limit?: number }): Promise<any> {
    if (!this.libraryId) return [];

    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', params.limit.toString());
    query.append('include', 'progress,userProgress,metadata,series,media');
    query.append('expanded', '1');

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
    const data = await this.fetchApi(`/me/items-in-progress?include=progress,userProgress,metadata,series,media&expanded=1`);
    return Array.isArray(data) ? data : (data?.results || []);
  }

  async getAllUserProgress(): Promise<ABSProgress[]> {
    // FIX: /me/progress endpoint often returns 404 on some server configurations.
    // We rely on /me/items-in-progress to get accurate, fresh sync data for active items.
    try {
      const items = await this.getItemsInProgress();
      return items
        .filter(item => item.userProgress)
        .map(item => ({
          itemId: item.id,
          currentTime: item.userProgress!.currentTime,
          duration: item.userProgress!.duration,
          progress: item.userProgress!.progress,
          isFinished: item.userProgress!.isFinished,
          lastUpdate: item.userProgress!.lastUpdate,
          hideFromContinueListening: item.userProgress!.hideFromContinueListening
        }));
    } catch (error) {
      console.warn('[ABSService] Failed to fetch user progress via items-in-progress fallback', error);
      return [];
    }
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
    const data = await this.fetchApi(`/me/listening-stats`);
    if (!data) return { totalTime: 0, days: {}, recentSessions: [] }; 
    return data;
  }

  async scanLibrary(): Promise<boolean> {
    if (!this.libraryId) {
      try {
        const libs = await this.getLibraries();
        if (libs && libs.length > 0) {
          this.libraryId = libs[0].id;
        } else {
          throw new Error("No libraries found.");
        }
      } catch (e) {
        console.error("Library discovery failed during scan:", e);
        throw e;
      }
    }

    if (!this.libraryId) throw new Error("Library ID unavailable");
    
    const data = await this.fetchApi(`/libraries/${this.libraryId}/scan`, { method: 'POST' });
    return data === 'OK' || !!data;
  }

  async getSeries(seriesId: string): Promise<ABSSeries | null> {
    if (!this.libraryId) return null;
    const data = await this.fetchApi(`/libraries/${this.libraryId}/series/${seriesId}?include=books,progress,rssfeed`);
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
    return this.fetchApi(`/me/progress/${itemId}`);
  }

  async saveProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
    const progress = duration > 0 ? currentTime / duration : 0;
    await this.fetchApi(`/me/progress/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ currentTime, duration, progress, isFinished: progress >= 0.99 }),
      keepalive: true // Ensure save completes
    });
  }

  async updateProgress(itemId: string, payload: { isFinished: boolean }): Promise<void> {
    await this.fetchApi(`/me/progress/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      keepalive: true
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
    // Keepalive ensures sync packets aren't killed on page unload/sleep
    await this.fetchApi(`/session/${sessionId}/sync`, { 
      method: 'POST', 
      body: JSON.stringify({ timeListened, currentTime }),
      keepalive: true
    });
  }

  async closeSession(sessionId: string, syncData?: { timeListened: number, currentTime: number }): Promise<void> {
    // Critical: Use keepalive to ensure close session fires even if tab is closed immediately
    await this.fetchApi(`/session/${sessionId}/close`, { 
      method: 'POST', 
      body: syncData ? JSON.stringify(syncData) : undefined,
      keepalive: true
    });
  }

  getCoverUrl(itemId: string): string {
    if (!itemId) return '';
    // Append timestamp to cover URL to attempt to break aggressive caching if cover changes, 
    // though less critical than data APIs.
    return `${this.serverUrl}/api/items/${itemId}/cover?token=${this.token}&_cb=${Date.now()}`;
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
    this.socket?.off('init');
    this.socket?.on('init', callback);
  }

  onUserOnline(callback: (data: any) => void) {
    this.socket?.off('user_online');
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
    this.socket?.off('user_item_progress_updated');
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
    this.socket?.off('user_item_progress_removed');
    this.socket?.off('user_item_progress_deleted');
    
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
    this.socket?.off('item_added');
    this.socket?.off('item_removed');
    this.socket?.off('series_updated');
    
    this.socket?.on('item_added', callback);
    this.socket?.on('item_removed', callback);
    this.socket?.on('series_updated', callback);
  }

  disconnect() {
    this.socket?.disconnect();
  }
}
