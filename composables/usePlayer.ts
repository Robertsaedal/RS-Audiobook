import { reactive, onUnmounted } from 'vue';
import { AuthState, ABSLibraryItem, ABSAudioTrack, PlayMethod } from '../types';
import { ABSService } from '../services/absService';
import Hls from 'hls.js';

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bufferedTime: number;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;
  sessionId: string | null;
  isHls: boolean;
  sleepTimer: number; // Remaining seconds for sleep
}

const state = reactive<PlayerState>({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  bufferedTime: 0,
  playbackRate: 1.0,
  isLoading: false,
  error: null,
  sessionId: null,
  isHls: false,
  sleepTimer: 0
});

let audioEl: HTMLAudioElement | null = null;
let hls: Hls | null = null;
let syncInterval: any = null;
let listeningTimeSinceSync = 0;
let lastTickTime = Date.now();

let audioTracks: ABSAudioTrack[] = [];
let currentTrackIndex = 0;
let trackStartTime = 0;
let startTime = 0;
let playWhenReady = false;

let absService: ABSService | null = null;
let activeItem: ABSLibraryItem | null = null;
let activeAuth: AuthState | null = null;

export function usePlayer() {
  const initialize = () => {
    const existing = document.getElementById('audio-player');
    if (existing) {
      existing.remove();
    }

    audioEl = document.createElement('audio');
    audioEl.id = 'audio-player';
    audioEl.style.display = 'none';
    audioEl.crossOrigin = 'anonymous';
    document.body.appendChild(audioEl);

    audioEl.addEventListener('play', onEvtPlay);
    audioEl.addEventListener('pause', onEvtPause);
    audioEl.addEventListener('progress', onEvtProgress);
    audioEl.addEventListener('ended', onEvtEnded);
    audioEl.addEventListener('error', onEvtError);
    audioEl.addEventListener('loadedmetadata', onEvtLoadedMetadata);
    audioEl.addEventListener('timeupdate', onEvtTimeupdate);

    return audioEl;
  };

  const onEvtPlay = () => {
    state.isPlaying = true;
  };

  const onEvtPause = () => {
    state.isPlaying = false;
  };

  const onEvtProgress = () => {
    if (!audioEl) return;
    state.bufferedTime = getLastBufferedTime();
  };

  const onEvtEnded = async () => {
    if (!state.isHls && currentTrackIndex < audioTracks.length - 1) {
      currentTrackIndex++;
      startTime = audioTracks[currentTrackIndex].startOffset;
      loadCurrentTrack();
    } else {
      state.isPlaying = false;
    }
  };

  const onEvtError = (e: any) => {
    if (state.isLoading || !audioEl?.src) return;
    state.error = "Archive stream interrupted. Attempting reconnection...";
  };

  const onEvtLoadedMetadata = () => {
    if (audioEl && !state.isHls) {
      audioEl.currentTime = trackStartTime;
    }
    state.isLoading = false;
    if (playWhenReady) {
      playWhenReady = false;
      play();
    }
  };

  const onEvtTimeupdate = () => {
    if (!audioEl) return;
    const currentTrackOffset = audioTracks[currentTrackIndex]?.startOffset || 0;
    state.currentTime = currentTrackOffset + audioEl.currentTime;
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
    
    const url = getFullUrl(currentTrack.contentUrl);
    audioEl.src = url;
    audioEl.load();
  };

  const setHlsStream = () => {
    trackStartTime = 0;
    currentTrackIndex = 0;

    const currentTrack = audioTracks[0];
    const url = getFullUrl(currentTrack.contentUrl);

    if (!Hls.isSupported()) {
      if (audioEl) {
        audioEl.src = url;
        audioEl.currentTime = startTime;
      }
      return;
    }

    const hlsOptions: any = {
      startPosition: startTime || -1,
      fragLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 10000,
          maxLoadTimeMs: 120000,
          timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
          errorRetry: {
            maxNumRetry: 8,
            retryDelayMs: 1000,
            maxRetryDelayMs: 8000,
            shouldRetry: (retryConfig: any, retryCount: number, isTimeout: boolean, httpStatus: any, retry: boolean) => {
              if (httpStatus?.code === 404 && retryConfig?.maxNumRetry > retryCount) return true;
              return retry;
            }
          }
        }
      }
    };

    if (hls) hls.destroy();
    hls = new Hls(hlsOptions);
    if (audioEl) {
      hls.attachMedia(audioEl);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls!.loadSource(url));
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        state.isLoading = false;
        if (playWhenReady) {
          playWhenReady = false;
          play();
        }
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          state.error = "Archive stream link severed (HLS Error).";
          hls?.destroy();
        }
      });
    }
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    lastTickTime = Date.now();
    syncInterval = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastTickTime) / 1000;
      lastTickTime = now;

      if (state.isPlaying) {
        // Handle Sleep Timer Countdown
        if (state.sleepTimer > 0) {
          state.sleepTimer = Math.max(0, state.sleepTimer - delta);
          if (state.sleepTimer === 0) {
            pause();
          }
        }

        // Handle Session Sync
        listeningTimeSinceSync += delta;
        if (listeningTimeSinceSync >= 10 && state.sessionId) {
          absService?.syncSession(state.sessionId, Math.floor(listeningTimeSinceSync), state.currentTime);
          listeningTimeSinceSync = 0;
        }
      }
    }, 1000);
  };

  const stopHeartbeat = () => {
    if (syncInterval) clearInterval(syncInterval);
  };

  const load = async (item: ABSLibraryItem, auth: AuthState, startAt?: number) => {
    state.isLoading = true;
    state.error = null;
    activeItem = item;
    activeAuth = auth;
    absService = new ABSService(auth.serverUrl, auth.user?.token || '');
    
    initialize();

    try {
      const deviceInfo = {
        clientName: 'R.S Audio Premium',
        deviceId: localStorage.getItem('absDeviceId') || Math.random().toString(36).substring(7)
      };
      if (!localStorage.getItem('absDeviceId')) localStorage.setItem('absDeviceId', deviceInfo.deviceId);

      const mimeTypes = ['audio/flac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/aac'];
      const session = await absService.startPlaybackSession(item.id, deviceInfo, mimeTypes);
      
      if (!session) throw new Error("Portal creation failed. Server unreachable.");

      state.sessionId = session.id;
      audioTracks = session.audioTracks;
      state.duration = session.libraryItem.media.duration;
      state.isHls = session.playMethod === PlayMethod.TRANSCODE;
      
      startTime = startAt !== undefined ? startAt : session.currentTime;
      playWhenReady = true;

      if (state.isHls) {
        setHlsStream();
      } else {
        const trackIndex = audioTracks.findIndex((t) => startTime >= t.startOffset && startTime < t.startOffset + t.duration);
        currentTrackIndex = trackIndex >= 0 ? trackIndex : 0;
        loadCurrentTrack();
      }

      startHeartbeat();
      setupMediaSession(item, auth);
    } catch (err: any) {
      state.error = err.message || "Failed to initialize archive link.";
      state.isLoading = false;
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

  const play = () => audioEl?.play();
  const pause = () => audioEl?.pause();

  const seek = (time: number) => {
    if (!audioEl) return;
    const target = Math.max(0, Math.min(time, state.duration));
    playWhenReady = state.isPlaying;

    if (state.isHls) {
      const offsetTime = target - (audioTracks[currentTrackIndex]?.startOffset || 0);
      audioEl.currentTime = Math.max(0, offsetTime);
    } else {
      const currentTrack = audioTracks[currentTrackIndex];
      if (target < currentTrack.startOffset || target > currentTrack.startOffset + currentTrack.duration) {
        const trackIdx = audioTracks.findIndex((t) => target >= t.startOffset && target < t.startOffset + t.duration);
        if (trackIdx >= 0) {
          startTime = target;
          currentTrackIndex = trackIdx;
          loadCurrentTrack();
        }
      } else {
        const offsetTime = target - currentTrack.startOffset;
        audioEl.currentTime = Math.max(0, offsetTime);
      }
    }
    state.currentTime = target;
  };

  const setPlaybackRate = (rate: number) => {
    state.playbackRate = rate;
    if (audioEl) audioEl.playbackRate = rate;
  };

  const setSleepTimer = (minutes: number) => {
    state.sleepTimer = minutes * 60;
  };

  const getLastBufferedTime = () => {
    if (!audioEl) return 0;
    const seekable = audioEl.buffered;
    const ranges = [];
    for (let i = 0; i < seekable.length; i++) {
      ranges.push({ start: seekable.start(i), end: seekable.end(i) });
    }
    if (!ranges.length) return 0;
    const buff = ranges.find((b) => b.start < audioEl!.currentTime && b.end > audioEl!.currentTime);
    if (buff) return buff.end + (audioTracks[currentTrackIndex]?.startOffset || 0);
    const last = ranges[ranges.length - 1];
    return last.end + (audioTracks[currentTrackIndex]?.startOffset || 0);
  };

  const destroy = () => {
    stopHeartbeat();
    if (state.sessionId) {
      absService?.closeSession(state.sessionId, {
        timeListened: Math.floor(listeningTimeSinceSync),
        currentTime: state.currentTime
      });
    }
    if (hls) hls.destroy();
    if (audioEl) {
      audioEl.pause();
      audioEl.src = '';
      audioEl.remove();
    }
    state.sessionId = null;
    state.isPlaying = false;
    activeItem = null;
    activeAuth = null;
    state.sleepTimer = 0;
  };

  return {
    state,
    load,
    play,
    pause,
    seek,
    setPlaybackRate,
    setSleepTimer,
    destroy
  };
}
