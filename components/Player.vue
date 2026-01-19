
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { AuthState, ABSLibraryItem, ABSChapter, ABSPlaybackSession, ABSAudioTrack, PlayMethod } from '../types';
import { ABSService } from '../services/absService';
import Hls from 'hls.js';
import { 
  ChevronDown, Play, Pause, Info, X, Activity, Plus, Minus, 
  AlertCircle, RotateCcw, RotateCw, List, Timer
} from 'lucide-vue-next';

const props = defineProps<{
  auth: AuthState,
  item: ABSLibraryItem
}>();

const emit = defineEmits<{
  (e: 'back'): void
}>();

// Refs for HTML Elements and Libraries
const audioRef = ref<HTMLAudioElement | null>(null);
const hlsInstance = ref<Hls | null>(null);

// Player State
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(props.item.media.duration || 0);
const chapters = ref<ABSChapter[]>([]);
const playbackSpeed = ref(1.0);
const sleepSeconds = ref(0);
const isLoading = ref(true);
const seekLoading = ref(false);
const error = ref<string | null>(null);
const bufferPercent = ref(0);

// Session State
const sessionId = ref<string | null>(null);
const audioTracks = ref<ABSAudioTrack[]>([]);
const currentTrackIndex = ref(0);
const isHlsTranscode = ref(false);

// UI State
const showChapters = ref(false);
const showInfo = ref(false);

const absService = new ABSService(props.auth.serverUrl, props.auth.user?.token || '');
const coverUrl = computed(() => absService.getCoverUrl(props.item.id));

// Timing Intervals
let syncInterval: any = null;
let sleepInterval: any = null;
let listeningTimeSinceSync = 0;
let lastTick = Date.now();

// Computed logic for display
const currentChapterIndex = computed(() => {
  if (!chapters.value.length) return -1;
  return chapters.value.findIndex((ch, i) => 
    currentTime.value >= ch.start && (i === chapters.value.length - 1 || currentTime.value < (chapters.value[i+1]?.start || ch.end))
  );
});

const currentChapter = computed(() => currentChapterIndex.value !== -1 ? chapters.value[currentChapterIndex.value] : null);
const timeRemaining = computed(() => Math.max(0, duration.value - currentTime.value));
const progressPercent = computed(() => duration.value ? (currentTime.value / duration.value) * 100 : 0);

const secondsToTimestamp = (s: number) => {
  if (isNaN(s) || s < 0) return "00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${sec.toString().padStart(2, '0')}`;
};

// Device identification for ABS
const getDeviceId = () => {
  let deviceId = localStorage.getItem('absDeviceId');
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('absDeviceId', deviceId);
  }
  return deviceId;
};

const getSupportedMimeTypes = () => {
  const types = ['audio/flac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/webm'];
  return types.filter(t => document.createElement('audio').canPlayType(t));
};

const togglePlay = async () => {
  if (!audioRef.value || isLoading.value) return;
  try {
    if (audioRef.value.paused) {
      await audioRef.value.play();
    } else {
      audioRef.value.pause();
    }
  } catch (err) {
    console.error("Playback toggle failed", err);
  }
};

const seek = (time: number) => {
  if (!audioRef.value || isLoading.value) return;
  const target = Math.max(0, Math.min(time, duration.value));
  
  if (isHlsTranscode.value) {
    audioRef.value.currentTime = target;
  } else {
    // Direct Play logic: Switch tracks if needed
    const trackIdx = audioTracks.value.findIndex(t => target >= t.startOffset && target < t.startOffset + t.duration);
    if (trackIdx !== -1 && trackIdx !== currentTrackIndex.value) {
      currentTrackIndex.value = trackIdx;
      loadTrack(trackIdx, target - audioTracks.value[trackIdx].startOffset);
    } else {
      audioRef.value.currentTime = target - (audioTracks.value[currentTrackIndex.value]?.startOffset || 0);
    }
  }
  currentTime.value = target;
};

const loadTrack = (index: number, offset = 0) => {
  const track = audioTracks.value[index];
  if (!audioRef.value || !track) return;
  
  const contentUrl = track.contentUrl.startsWith('/hls') ? track.contentUrl : `/api/items/${props.item.id}/file/${track.index}`;
  const fullUrl = `${props.auth.serverUrl}${contentUrl}${contentUrl.includes('?') ? '&' : '?'}token=${props.auth.user?.token}`;
  
  audioRef.value.src = fullUrl;
  audioRef.value.load();
  audioRef.value.currentTime = offset;
};

const heartbeat = () => {
  if (!sessionId.value || !isPlaying.value) return;
  
  const now = Date.now();
  const elapsed = (now - lastTick) / 1000;
  lastTick = now;
  listeningTimeSinceSync += elapsed;

  if (listeningTimeSinceSync >= 10) {
    absService.syncSession(sessionId.value, Math.floor(listeningTimeSinceSync), currentTime.value);
    listeningTimeSinceSync = 0;
  }
};

onMounted(async () => {
  isLoading.value = true;
  try {
    const deviceInfo = { clientName: 'Archive Web', deviceId: getDeviceId() };
    const session = await absService.startPlaybackSession(props.item.id, deviceInfo, getSupportedMimeTypes());
    
    if (!session) throw new Error("Portal Initialization Failed");

    sessionId.value = session.id;
    audioTracks.value = session.audioTracks;
    isHlsTranscode.value = session.playMethod === PlayMethod.TRANSCODE;
    chapters.value = session.libraryItem.media.chapters || [];
    duration.value = session.libraryItem.media.duration;
    
    const startAt = session.currentTime || 0;
    currentTime.value = startAt;

    await nextTick();
    const audio = audioRef.value;
    if (audio) {
      audio.crossOrigin = 'anonymous';
      
      if (isHlsTranscode.value && Hls.isSupported()) {
        const hlsUrl = `${props.auth.serverUrl}${audioTracks.value[0].contentUrl}&token=${props.auth.user?.token}`;
        const hls = new Hls({ 
          startPosition: startAt,
          xhrSetup: (xhr) => {
            xhr.withCredentials = true;
            xhr.setRequestHeader('Authorization', `Bearer ${props.auth.user?.token}`);
          },
          fragLoadingTimeOut: 30000,
          manifestLoadingTimeOut: 30000
        });
        hlsInstance.value = hls;
        hls.attachMedia(audio);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(hlsUrl));
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          isLoading.value = false;
        });
        hls.on(Hls.Events.BUFFER_APPENDED, () => {
          if (audio.buffered.length) bufferPercent.value = (audio.buffered.end(audio.buffered.length - 1) / duration.value) * 100;
        });
      } else {
        // Direct Play or Native HLS
        const trackIdx = audioTracks.value.findIndex(t => startAt >= t.startOffset && startAt < t.startOffset + t.duration);
        currentTrackIndex.value = trackIdx !== -1 ? trackIdx : 0;
        loadTrack(currentTrackIndex.value, startAt - (audioTracks.value[currentTrackIndex.value]?.startOffset || 0));
        
        audio.addEventListener('canplay', () => {
          isLoading.value = false;
        }, { once: true });
      }
    }

    syncInterval = setInterval(heartbeat, 1000);
    
    // Set up Media Session API
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: session.displayTitle,
        artist: session.displayAuthor,
        artwork: [{ src: coverUrl.value, sizes: '512x512', type: 'image/png' }]
      });
      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('seekbackward', () => seek(currentTime.value - 15));
      navigator.mediaSession.setActionHandler('seekforward', () => seek(currentTime.value + 30));
    }

  } catch (e: any) {
    error.value = e.message || "Archive Link Severed";
  }
});

onUnmounted(async () => {
  clearInterval(syncInterval);
  clearInterval(sleepInterval);
  if (sessionId.value) {
    const syncData = listeningTimeSinceSync > 1 ? {
      timeListened: Math.floor(listeningTimeSinceSync),
      currentTime: currentTime.value
    } : undefined;
    absService.closeSession(sessionId.value, syncData);
  }
  if (hlsInstance.value) hlsInstance.value.destroy();
});

watch(playbackSpeed, (val) => { if (audioRef.value) audioRef.value.playbackRate = val; });

// Handle track changes in Direct Play
const onTrackEnded = () => {
  if (!isHlsTranscode.value && currentTrackIndex.value < audioTracks.value.length - 1) {
    currentTrackIndex.value++;
    loadTrack(currentTrackIndex.value, 0);
    audioRef.value?.play();
  } else {
    isPlaying.value = false;
  }
};

const onTimeUpdate = (e: any) => {
  const offset = isHlsTranscode.value ? 0 : (audioTracks.value[currentTrackIndex.value]?.startOffset || 0);
  currentTime.value = e.target.currentTime + offset;
};
</script>

<template>
  <div class="h-[100dvh] w-full bg-black text-white flex flex-col relative overflow-hidden font-sans select-none safe-top safe-bottom">
    <audio 
      ref="audioRef" 
      @timeupdate="onTimeUpdate" 
      @play="isPlaying = true" 
      @pause="isPlaying = false" 
      @ended="onTrackEnded"
      crossorigin="anonymous" 
    />

    <!-- Portal Loader -->
    <Transition name="fade">
      <div v-if="isLoading" class="absolute inset-0 bg-black flex flex-col items-center justify-center gap-6 z-[60]">
        <div class="w-16 h-16 border-4 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
        <h2 class="font-black text-purple-500 tracking-[0.5em] text-[10px] uppercase animate-pulse">Establishing Archive Link</h2>
      </div>
    </Transition>

    <!-- Error State -->
    <div v-if="error" class="absolute inset-0 bg-black flex flex-col items-center justify-center p-12 gap-8 text-center z-[70]">
      <AlertCircle :size="64" class="text-red-500" />
      <div class="space-y-2">
        <h2 class="text-2xl font-black uppercase tracking-tighter">Archive Connection Error</h2>
        <p class="text-[10px] font-black uppercase tracking-widest text-neutral-500">{{ error }}</p>
      </div>
      <button @click="emit('back')" class="w-full max-w-xs py-5 bg-neutral-900 rounded-full font-black uppercase text-xs tracking-widest border border-white/5">Return to Vault</button>
    </div>

    <!-- Main Player UI -->
    <template v-if="!error">
      <header class="px-8 pt-8 pb-4 flex justify-between items-center z-20 shrink-0">
        <button @click="emit('back')" class="bg-neutral-900/40 p-3 rounded-2xl border border-white/5 active:scale-90 transition-all">
          <ChevronDown :size="20" class="text-neutral-500" />
        </button>
        <button @click="showChapters = true" class="flex items-center gap-3 bg-neutral-900/60 pl-5 pr-4 py-2.5 rounded-full border border-white/5 active:scale-95 transition-all max-w-[60%]">
          <span class="text-[10px] font-black uppercase tracking-widest text-purple-500 truncate">{{ currentChapter?.title || 'Archive Index' }}</span>
          <List :size="16" class="text-purple-500 shrink-0" />
        </button>
        <button @click="showInfo = true" class="bg-neutral-900/40 p-3 rounded-2xl border border-white/5 active:scale-90 transition-all">
          <Info :size="20" class="text-neutral-500" />
        </button>
      </header>

      <div class="flex-1 flex flex-col items-center justify-center px-8 relative">
        <div class="relative w-full max-w-[320px] aspect-square group">
          <div class="absolute -inset-10 bg-purple-600/10 blur-[100px] rounded-full opacity-50" />
          <img :src="coverUrl" class="w-full h-full object-cover rounded-[56px] shadow-[0_32px_64px_rgba(0,0,0,0.8)] border border-white/10 relative z-10" />
          
          <div v-if="sleepSeconds > 0" class="absolute top-6 left-6 z-20 flex items-center gap-2 bg-purple-600/90 backdrop-blur-xl px-4 py-2 rounded-full border border-white/20">
            <Timer :size="14" class="text-white" />
            <span class="text-[10px] font-black font-mono text-white">{{ secondsToTimestamp(sleepSeconds) }}</span>
          </div>
        </div>
        
        <div class="mt-12 text-center space-y-2 w-full max-w-md px-4">
          <h1 class="text-2xl font-black uppercase tracking-tighter line-clamp-1 leading-tight">{{ item.media.metadata.title }}</h1>
          <p class="text-neutral-500 text-[10px] font-black uppercase tracking-[0.4em]">{{ item.media.metadata.authorName }}</p>
        </div>
      </div>

      <footer class="px-8 pb-10 space-y-8 max-w-xl mx-auto w-full">
        <div class="space-y-4">
          <div class="flex justify-between items-end text-[10px] font-black font-mono px-1">
            <div class="flex flex-col">
              <span class="text-neutral-700 text-[8px] uppercase mb-0.5">Sync</span>
              <span class="text-white">{{ secondsToTimestamp(currentTime) }}</span>
            </div>
            <div class="flex flex-col items-end">
              <span class="text-neutral-700 text-[8px] uppercase mb-0.5">Portal Rem.</span>
              <span class="text-purple-500">-{{ secondsToTimestamp(timeRemaining) }}</span>
            </div>
          </div>
          
          <div 
            class="h-1.5 w-full bg-neutral-900 rounded-full relative cursor-pointer overflow-hidden" 
            @click="(e: any) => seek((e.offsetX / e.currentTarget.clientWidth) * duration)"
          >
            <div class="absolute inset-y-0 left-0 bg-neutral-800 transition-all duration-500" :style="{ width: bufferPercent + '%' }" />
            <div class="absolute inset-y-0 left-0 gradient-aether shadow-aether-glow transition-all duration-150" :style="{ width: progressPercent + '%' }" />
            
            <div v-if="chapters.length > 1" class="absolute inset-0 pointer-events-none">
              <div v-for="ch in chapters" :key="ch.id" class="absolute inset-y-0 w-px bg-black/40" :style="{ left: (ch.start/duration)*100 + '%' }" />
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 bg-neutral-900/40 p-2 rounded-2xl border border-white/5">
            <button @click="playbackSpeed = Math.max(0.5, playbackSpeed - 0.1)" class="p-2 text-neutral-500"><Minus :size="14" /></button>
            <span class="text-[10px] font-black font-mono text-purple-500 w-8 text-center">{{ playbackSpeed.toFixed(1) }}x</span>
            <button @click="playbackSpeed = Math.min(2.5, playbackSpeed + 0.1)" class="p-2 text-neutral-500"><Plus :size="14" /></button>
          </div>

          <div class="flex items-center gap-6">
            <button @click="seek(currentTime - 15)" class="text-neutral-500 active:scale-90 transition-transform"><RotateCcw :size="24" /></button>
            <button @click="togglePlay" class="w-20 h-20 rounded-full gradient-aether flex items-center justify-center shadow-aether-glow active:scale-95 transition-all">
              <Pause v-if="isPlaying" :size="32" class="text-white fill-current" />
              <Play v-else :size="32" class="text-white fill-current translate-x-1" />
            </button>
            <button @click="seek(currentTime + 30)" class="text-neutral-500 active:scale-90 transition-transform"><RotateCw :size="24" /></button>
          </div>

          <button @click="sleepSeconds = sleepSeconds === 0 ? 1800 : 0" class="flex items-center gap-2 bg-neutral-900/40 p-3 rounded-2xl border border-white/5 transition-colors" :class="sleepSeconds > 0 ? 'border-purple-600/40 text-purple-500' : 'text-neutral-500'">
            <Timer :size="18" />
            <span class="text-[10px] font-black uppercase">{{ sleepSeconds > 0 ? 'Active' : 'Off' }}</span>
          </button>
        </div>
      </footer>
    </template>

    <!-- Index View (Chapters) -->
    <Transition name="slide-up">
      <div v-if="showChapters" class="fixed inset-0 bg-black z-[100] flex flex-col">
        <header class="p-8 border-b border-white/5 flex justify-between items-center bg-neutral-950/50 backdrop-blur-xl">
          <h2 class="text-xl font-black uppercase tracking-widest text-purple-500">Archive Index</h2>
          <button @click="showChapters = false" class="p-3 bg-neutral-900 rounded-2xl text-neutral-500 active:scale-90"><X :size="20"/></button>
        </header>
        <div class="flex-1 overflow-y-auto p-4 no-scrollbar max-w-2xl mx-auto w-full">
          <button 
            v-for="(ch, i) in chapters" 
            :key="i" 
            @click="seek(ch.start); showChapters = false;"
            class="w-full flex items-center justify-between p-6 rounded-[32px] mb-3 transition-all border border-transparent"
            :class="currentChapterIndex === i ? 'bg-purple-600/10 border-purple-600/30' : 'hover:bg-neutral-900'"
          >
            <div class="flex flex-col items-start gap-1">
              <span class="text-sm font-black uppercase tracking-tight text-left" :class="currentChapterIndex === i ? 'text-purple-500' : 'text-neutral-300'">{{ ch.title }}</span>
              <span class="text-[9px] font-black text-neutral-600 uppercase tracking-widest">{{ secondsToTimestamp(ch.end - ch.start) }} Segment</span>
            </div>
            <Activity v-if="currentChapterIndex === i" :size="16" class="text-purple-500 animate-pulse" />
            <span v-else class="text-[10px] font-mono text-neutral-800">{{ secondsToTimestamp(ch.start) }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.6s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
