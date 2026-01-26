
import { reactive, onUnmounted } from 'vue';
import { AuthState, ABSLibraryItem, ABSAudioTrack, PlayMethod, ABSProgress } from '../types';
import { ABSService } from '../services/absService';
import { OfflineManager } from '../services/offlineManager';
import { getDominantColor } from '../services/colorUtils';
import Hls from 'hls.js';

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bufferedTime: number;
  playbackRate: number;
  preservesPitch: boolean; 
  isLoading: boolean;
  error: string | null;
  sessionId: string | null;
  isHls: boolean;
  sleepChapters: number; 
  sleepEndTime: number | null; 
  currentRealtime: number;
  activeItem: ABSLibraryItem | null;
  isOffline: boolean;
  accentColor: string;
}

const storedRate = localStorage.getItem('rs_playback_rate');
const initialRate = storedRate ? parseFloat(storedRate) : 1.0;

const state = reactive<PlayerState>({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  bufferedTime: 0,
  playbackRate: initialRate,
  preservesPitch: true,
  isLoading: false,
  error: null,
  sessionId: null,
  isHls: false,
  sleepChapters: 0,
  sleepEndTime: null,
  currentRealtime: Date.now(),
  activeItem: null,
  isOffline: false,
  accentColor: '#A855F7'
});

let audioEl: HTMLAudioElement | null = null;
let hls: Hls | null = null;
let syncInterval: any = null;
let listeningTimeSinceSync = 0;
let lastTickTime = Date.now();
let lastChapterIndex = -1;
let lastSyncDispatch = 0;

let audioTracks: ABSAudioTrack[] = [];
let currentTrackIndex = 0;
let trackStartTime = 0;
let startTime = 0;
let playWhenReady = false;

let absService: ABSService | null = null;
let activeAuth: AuthState | null = null;
let activeObjectUrl: string | null = null;

export function usePlayer() {
  const initialize = () => {
    const existing = document.getElementById('audio-player');
    if (existing) existing.remove();

    audioEl = document.createElement('audio');
    audioEl.id = 'audio-player';
    audioEl.style.display = 'none';
    audioEl.crossOrigin = 'anonymous';
    (audioEl as any).preservesPitch = true;
    (audioEl as any).webkitPreservesPitch = true;
    (audioEl as any).mozPreservesPitch = true;
    audioEl.playbackRate = state.playbackRate;

    document.body.appendChild(audioEl);

    audioEl.addEventListener('play', () => state.isPlaying = true);
    audioEl.addEventListener('pause', onEvtPause);
    audioEl.addEventListener('progress', () => { if (audioEl) state.bufferedTime = getLastBufferedTime(); });
    audioEl.addEventListener('ended', onEvtEnded);
    audioEl.addEventListener('error', onEvtError);
    audioEl.addEventListener('loadedmetadata', onEvtLoadedMetadata);
    audioEl.addEventListener('timeupdate', onEvtTimeupdate);

    return audioEl;
  };

  const onEvtPause = () => {
    state.isPlaying = false;
    syncNow();
  };

  const onEvtEnded = async () => {
    if (!state.isHls && !state.isOffline && currentTrackIndex < audioTracks.length - 1) {
      currentTrackIndex++;
      startTime = audioTracks[currentTrackIndex].startOffset;
      loadCurrentTrack();
    } else {
      state.isPlaying = false;
      syncNow();
    }
  };

  const onEvtError = () => {
    if (state.isLoading || !audioEl?.src) return;
    state.error = "Archive stream interrupted. Reconnecting...";
  };

  const onEvtLoadedMetadata = () => {
    if (audioEl && !state.isHls) audioEl.currentTime = trackStartTime;
    state.isLoading = false;
    if (playWhenReady) {
      playWhenReady = false;
      play();
    }
  };

  const onEvtTimeupdate = () => {
    if (!audioEl || !state.activeItem || state.isLoading) return;
    
    state.currentRealtime = Date.now();
    if (state.sleepEndTime && state.currentRealtime >= state.sleepEndTime) {
      pause();
      state.sleepEndTime = null;
    }
    
    const playerTime = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
    const currentTrackOffset = state.isOffline ? 0 : (audioTracks[currentTrackIndex]?.startOffset || 0);
    const newTime = currentTrackOffset + playerTime;

    const chapters = state.activeItem.media.chapters || [];
    if (chapters.length > 0) {
      const time = newTime + 0.1;
      const newChapterIndex = chapters.findIndex((ch, i) => 
        time >= ch.start && (i === chapters.length - 1 || time < (chapters[i+1]?.start || ch.end))
      );

      if (lastChapterIndex !== -1 && newChapterIndex > lastChapterIndex) {
        if (state.sleepChapters > 0) {
          state.sleepChapters--;
          if (state.sleepChapters === 0) pause();
        }
      }
      lastChapterIndex = newChapterIndex;
    }

    state.currentTime = newTime;

    const now = Date.now();
    if (now - lastSyncDispatch > 1000) {
        dispatchProgressSync();
        lastSyncDispatch = now;
    }
  };

  const dispatchProgressSync = () => {
    if (!state.activeItem) return;
    window.dispatchEvent(new CustomEvent('rs-progress-sync', { detail: {
      itemId: state.activeItem.id,
      currentTime: state.currentTime,
      duration: state.duration,
      progress: state.duration > 0 ? (state.currentTime / state.duration) : 0,
      isFinished: false,
      lastUpdate: Date.now()
    }}));
  };

  const getFullUrl = (relativeUrl: string) => {
    if (!activeAuth) return '';
    const baseUrl = activeAuth.serverUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
    const path = relativeUrl.startsWith('/api') ? relativeUrl : `/api${relativeUrl}`;
    return `${baseUrl}${path}${path.includes('?') ? '&' : '?'}token=${activeAuth.user?.token}`;
  };

  const loadCurrentTrack = () => {
    const currentTrack = audioTracks[currentTrackIndex];
    if (!currentTrack || !audioEl) return;
    state.isLoading = true;
    trackStartTime = Math.max(0, startTime - (currentTrack.startOffset || 0));
    audioEl.src = getFullUrl(currentTrack.contentUrl);
    audioEl.load();
  };

  const setHlsStream = () => {
    trackStartTime = 0;
    currentTrackIndex = 0;
    const url = getFullUrl(audioTracks[0].contentUrl);

    if (!Hls.isSupported()) {
      if (audioEl) { audioEl.src = url; audioEl.currentTime = startTime; }
      return;
    }

    if (hls) hls.destroy();
    hls = new Hls({ startPosition: startTime || -1 });
    if (audioEl) {
      hls.attachMedia(audioEl);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls!.loadSource(url));
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        state.isLoading = false;
        if (playWhenReady) { playWhenReady = false; play(); }
      });
    }
  };

  const load = async (item: ABSLibraryItem, auth: AuthState, startAt?: number) => {
    state.isLoading = true;
    state.error = null;
    state.activeItem = item;
    state.isOffline = false;
    activeAuth = auth;
    absService = new ABSService(auth.serverUrl, auth.user?.token || '');
    
    initialize();

    const coverUrl = `${auth.serverUrl.replace(/\/api\/?$/, '')}/api/items/${item.id}/cover?token=${auth.user?.token}`;

    try {
      // 🚀 PARALLEL OPTIMIZATION: Start all initialization tasks at once
      const [offlineBook, dominantColor] = await Promise.all([
        OfflineManager.getBook(item.id),
        getDominantColor(coverUrl)
      ]);

      state.accentColor = dominantColor;

      if (offlineBook && offlineBook.blob) {
        state.isOffline = true;
        state.isHls = false;
        state.sessionId = null;
        state.duration = offlineBook.metadata.media.duration;
        if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = URL.createObjectURL(offlineBook.blob);
        audioEl!.src = activeObjectUrl;
        trackStartTime = startAt !== undefined ? startAt : (item.userProgress?.currentTime || 0);
        startTime = trackStartTime;
        playWhenReady = true;
        audioEl!.load();
        return;
      }

      const deviceInfo = {
        clientName: 'R.S Audio Premium',
        deviceId: localStorage.getItem('absDeviceId') || Math.random().toString(36).substring(7)
      };
      if (!localStorage.getItem('absDeviceId')) localStorage.setItem('absDeviceId', deviceInfo.deviceId);

      const mimeTypes = ['audio/flac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/aac'];
      const session = await absService.startPlaybackSession(item.id, deviceInfo, mimeTypes);
      
      if (!session) throw new Error("Portal creation failed.");

      state.sessionId = session.id;
      state.activeItem = session.libraryItem;
      audioTracks = session.audioTracks;
      state.duration = session.libraryItem.media.duration;
      state.isHls = session.playMethod === PlayMethod.TRANSCODE;
      
      startTime = startAt !== undefined ? startAt : session.currentTime;
      playWhenReady = true;

      if (state.isHls) {
        setHlsStream();
      } else {
        const trackIdx = audioTracks.findIndex((t) => startTime >= t.startOffset && startTime < t.startOffset + t.duration);
        currentTrackIndex = Math.max(0, trackIdx);
        loadCurrentTrack();
      }

      startHeartbeat();
      setupMediaSession(state.activeItem, auth);
    } catch (err: any) {
      state.error = err.message || "Archive link failed.";
      state.isLoading = false;
    }
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    lastTickTime = Date.now();
    syncInterval = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastTickTime) / 1000;
      lastTickTime = now;
      if (state.isPlaying && state.sessionId) {
        listeningTimeSinceSync += delta;
        if (listeningTimeSinceSync >= 10) syncNow();
      }
    }, 1000);
  };

  const syncNow = () => {
    dispatchProgressSync();
    if (state.sessionId && absService) {
        absService.syncSession(state.sessionId, Math.floor(listeningTimeSinceSync), state.currentTime);
        listeningTimeSinceSync = 0;
    }
  };

  const stopHeartbeat = () => { if (syncInterval) clearInterval(syncInterval); };
  const play = () => audioEl?.play().catch(() => {});
  const pause = () => audioEl?.pause();

  const seek = (time: number) => {
    if (!audioEl) return;
    const target = Math.max(0, Math.min(time, state.duration));
    playWhenReady = state.isPlaying;

    if (state.isOffline) {
      audioEl.currentTime = target;
    } else if (state.isHls) {
      const offsetTime = target - (audioTracks[currentTrackIndex]?.startOffset || 0);
      audioEl.currentTime = Math.max(0, offsetTime);
    } else {
      const currentTrack = audioTracks[currentTrackIndex];
      if (target < currentTrack.startOffset || target > currentTrack.startOffset + currentTrack.duration) {
        const trackIdx = audioTracks.findIndex((t) => target >= t.startOffset && target < t.startOffset + t.duration);
        if (trackIdx >= 0) { startTime = target; currentTrackIndex = trackIdx; loadCurrentTrack(); }
      } else {
        audioEl.currentTime = target - currentTrack.startOffset;
      }
    }
    state.currentTime = target;
    dispatchProgressSync(); 
  };

  const setPlaybackRate = (rate: number) => {
    const newRate = parseFloat(Math.max(0.5, Math.min(3.0, rate)).toFixed(2));
    state.playbackRate = newRate;
    if (audioEl) audioEl.playbackRate = newRate;
    localStorage.setItem('rs_playback_rate', String(newRate));
  };

  // --- NEW: Helper to set sleep chapters count ---
  const setSleepChapters = (chapters: number) => {
    state.sleepChapters = chapters;
  };

  // --- NEW: Helper to set sleep timer in minutes ---
  const setSleepTimer = (minutes: number | null) => {
    if (minutes === null) {
      state.sleepEndTime = null;
    } else {
      state.sleepEndTime = Date.now() + (minutes * 60 * 1000);
    }
  };

  const setupMediaSession = (item: ABSLibraryItem, auth: AuthState) => {
    if ('mediaSession' in navigator) {
      const baseUrl = auth.serverUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.media.metadata.title,
        artist: item.media.metadata.authorName,
        artwork: [{ src: `${baseUrl}/api/items/${item.id}/cover?token=${auth.user?.token}`, sizes: '512x512', type: 'image/png' }]
      });
      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('seekbackward', () => seek(state.currentTime - 10));
      navigator.mediaSession.setActionHandler('seekforward', () => seek(state.currentTime + 30));
    }
  };

  const getLastBufferedTime = () => {
    if (!audioEl) return 0;
    try {
      const seekable = audioEl.buffered;
      if (!seekable.length) return 0;
      return seekable.end(seekable.length - 1) + (state.isOffline ? 0 : (audioTracks[currentTrackIndex]?.startOffset || 0));
    } catch { return 0; }
  };

  const destroy = () => {
    stopHeartbeat();
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    if (state.sessionId) absService?.closeSession(state.sessionId, { timeListened: Math.floor(listeningTimeSinceSync), currentTime: state.currentTime });
    if (hls) hls.destroy();
    if (audioEl) { audioEl.pause(); audioEl.src = ''; audioEl.remove(); }
    state.sessionId = null; state.isPlaying = false; state.activeItem = null;
  };

  return { state, load, play, pause, seek, setPlaybackRate, setSleepChapters, setSleepTimer, syncNow, destroy };
}
