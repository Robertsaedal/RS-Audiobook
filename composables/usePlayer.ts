import { ref, reactive, onUnmounted } from 'vue';
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
  sleepChapters: number; // 0 = off, 1 = end of current, 2 = end of next...
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
  sleepChapters: 0
});

let audioEl: HTMLAudioElement | null = null;
let hls: Hls | null = null;
let syncInterval: any = null;
let listeningTimeSinceSync = 0;
let lastTickTime = Date.now();
let tracks: ABSAudioTrack[] = [];
let currentTrackIdx = 0;
let absService: ABSService | null = null;
let activeItem: ABSLibraryItem | null = null;

export function usePlayer() {
  const initAudio = () => {
    if (audioEl) return audioEl;
    audioEl = new Audio();
    audioEl.id = 'archive-player-core';
    audioEl.crossOrigin = 'anonymous';
    
    audioEl.addEventListener('play', () => state.isPlaying = true);
    audioEl.addEventListener('pause', () => state.isPlaying = false);
    audioEl.addEventListener('timeupdate', onTimeUpdate);
    audioEl.addEventListener('progress', onProgress);
    audioEl.addEventListener('ended', onEnded);
    audioEl.addEventListener('error', (e) => {
      console.error("Audio stream error:", audioEl?.error);
      state.error = "Archive link severed or data corrupted. (Source Error)";
    });

    return audioEl;
  };

  const onTimeUpdate = () => {
    if (!audioEl) return;
    const trackOffset = state.isHls ? 0 : (tracks[currentTrackIdx]?.startOffset || 0);
    state.currentTime = audioEl.currentTime + trackOffset;
    checkSleepTimer();
  };

  const checkSleepTimer = () => {
    if (state.sleepChapters <= 0 || !activeItem?.media?.chapters) return;
    const chapters = activeItem.media.chapters;
    
    const currentIdx = chapters.findIndex((ch, i) => 
      state.currentTime >= ch.start && (i === chapters.length - 1 || state.currentTime < (chapters[i+1]?.start || ch.end))
    );

    if (currentIdx === -1) return;

    const targetIdx = currentIdx + (state.sleepChapters - 1);
    const targetChapter = chapters[Math.min(targetIdx, chapters.length - 1)];
    
    if (state.currentTime >= targetChapter.end - 0.5) {
      pause();
      state.sleepChapters = 0;
    }
  };

  const onProgress = () => {
    if (!audioEl || audioEl.buffered.length === 0) return;
    const trackOffset = state.isHls ? 0 : (tracks[currentTrackIdx]?.startOffset || 0);
    state.bufferedTime = audioEl.buffered.end(audioEl.buffered.length - 1) + trackOffset;
  };

  const onEnded = () => {
    if (!state.isHls && currentTrackIdx < tracks.length - 1) {
      currentTrackIdx++;
      loadTrack(currentTrackIdx, 0);
      audioEl?.play();
    } else {
      state.isPlaying = false;
    }
  };

  const resetAudioSource = () => {
    if (!audioEl) return;
    audioEl.pause();
    audioEl.src = '';
    try {
      audioEl.load();
    } catch (e) {}
  };

  const loadTrack = (idx: number, offset = 0) => {
    if (!audioEl || !tracks[idx] || !activeItem) return;
    
    resetAudioSource();

    // Pull fresh credentials
    const authString = localStorage.getItem('rs_auth');
    if (!authString) return;
    const auth = JSON.parse(authString);
    const token = auth.user.token;
    
    // THE 404 FIX: Rewrite URL logic
    // Construct robust BASE URL by removing /api suffix and trailing slashes
    const baseUrl = auth.serverUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');

    // Robust file selection using strictly activeItem.id and audioFile ID
    const audioFile = activeItem.media.audioFiles[idx];
    const fileId = audioFile?.id || activeItem.id;
    const url = `${baseUrl}/api/items/${activeItem.id}/file/${fileId}?token=${token}`;
    
    audioEl.src = url;
    audioEl.load();
    audioEl.currentTime = offset;
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    lastTickTime = Date.now();
    syncInterval = setInterval(() => {
      if (!state.isPlaying || !state.sessionId) return;

      const now = Date.now();
      const delta = (now - lastTickTime) / 1000;
      lastTickTime = now;
      listeningTimeSinceSync += delta;

      if (listeningTimeSinceSync >= 10) {
        absService?.syncSession(state.sessionId, Math.floor(listeningTimeSinceSync), state.currentTime);
        listeningTimeSinceSync = 0;
      }
    }, 1000);
  };

  const stopHeartbeat = () => {
    if (syncInterval) clearInterval(syncInterval);
  };

  const load = async (item: ABSLibraryItem, auth: AuthState, startTimeOverride?: number) => {
    state.isLoading = true;
    state.error = null;
    activeItem = item;
    absService = new ABSService(auth.serverUrl, auth.user?.token || '');
    
    const audio = initAudio();
    resetAudioSource();

    try {
      const deviceInfo = {
        clientName: 'R.S Audio Premium',
        deviceId: localStorage.getItem('absDeviceId') || Math.random().toString(36).substring(7)
      };
      if (!localStorage.getItem('absDeviceId')) localStorage.setItem('absDeviceId', deviceInfo.deviceId);

      const mimeTypes = ['audio/flac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/aac'].filter(t => audio.canPlayType(t));
      const session = await absService.startPlaybackSession(item.id, deviceInfo, mimeTypes);
      
      if (!session) throw new Error("Portal creation failed. Server unreachable.");

      state.sessionId = session.id;
      tracks = session.audioTracks;
      state.duration = session.libraryItem.media.duration;
      state.isHls = session.playMethod === PlayMethod.TRANSCODE;
      
      const startAt = startTimeOverride !== undefined ? startTimeOverride : session.currentTime;
      state.currentTime = startAt;

      if (state.isHls) {
        if (hls) hls.destroy();
        if (Hls.isSupported()) {
          hls = new Hls({
            startPosition: startAt,
            xhrSetup: (xhr) => {
              xhr.setRequestHeader('Authorization', `Bearer ${auth.user?.token}`);
            },
          });
          const rawBase = auth.serverUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
          const contentPath = tracks[0].contentUrl.startsWith('/api') ? tracks[0].contentUrl : `/api${tracks[0].contentUrl}`;
          const hlsUrl = `${rawBase}${contentPath}${contentPath.includes('?') ? '&' : '?'}token=${auth.user?.token}`;
          
          hls.attachMedia(audio);
          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            hls!.loadSource(hlsUrl);
          });
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            state.isLoading = false;
            audio.play().catch(e => console.warn("Autoplay prevented:", e));
          });
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              state.error = "HLS stream link severed.";
              hls?.destroy();
            }
          });
        } else {
          const rawBase = auth.serverUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
          const contentPath = tracks[0].contentUrl.startsWith('/api') ? tracks[0].contentUrl : `/api${tracks[0].contentUrl}`;
          audio.src = `${rawBase}${contentPath}${contentPath.includes('?') ? '&' : '?'}token=${auth.user?.token}`;
          audio.currentTime = startAt;
          state.isLoading = false;
          audio.play().catch(e => console.warn("Autoplay prevented:", e));
        }
      } else {
        const trackIdx = tracks.findIndex(t => startAt >= t.startOffset && startAt < t.startOffset + t.duration);
        currentTrackIdx = trackIdx !== -1 ? trackIdx : 0;
        loadTrack(currentTrackIdx, startAt - (tracks[currentTrackIdx]?.startOffset || 0));
        state.isLoading = false;
        audio.play().catch(e => console.warn("Autoplay prevented:", e));
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
    
    if (state.isHls) {
      audioEl.currentTime = target;
    } else {
      const trackIdx = tracks.findIndex(t => target >= t.startOffset && target < t.startOffset + t.duration);
      if (trackIdx !== -1 && trackIdx !== currentTrackIdx) {
        currentTrackIdx = trackIdx;
        loadTrack(trackIdx, target - tracks[trackIdx].startOffset);
      } else {
        audioEl.currentTime = target - (tracks[currentTrackIdx]?.startOffset || 0);
      }
    }
    state.currentTime = target;
  };

  const setPlaybackRate = (rate: number) => {
    state.playbackRate = rate;
    if (audioEl) audioEl.playbackRate = rate;
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
      try {
        audioEl.load();
      } catch (e) {}
    }
    state.sessionId = null;
    state.isPlaying = false;
    activeItem = null;
  };

  return {
    state,
    load,
    play,
    pause,
    seek,
    setPlaybackRate,
    destroy
  };
}