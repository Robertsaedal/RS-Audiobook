
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { AuthState, ABSLibraryItem } from '../types';
import { usePlayer } from '../composables/usePlayer';
import { ABSService } from '../services/absService';
import { OfflineManager, downloadQueue } from '../services/offlineManager'; // Import Queue
import ChapterEditor from '../components/ChapterEditor.vue';
import { 
  ChevronDown, Play, Pause, Info, X, SkipBack, SkipForward,
  RotateCcw, RotateCw, ChevronRight, Moon, Plus, Minus, Mic, Clock, Layers, Download, CheckCircle, Calendar, ArrowRight, Heart, Gauge
} from 'lucide-vue-next';

const props = defineProps<{
  auth: AuthState,
  item: ABSLibraryItem
}>();

const emit = defineEmits<{
  (e: 'back'): void,
  (e: 'select-series', seriesId: string): void,
  (e: 'item-updated', updatedItem: ABSLibraryItem): void
}>();

const { state, load, play, pause, seek, setPlaybackRate, setSleepChapters, setSleepTimer, destroy } = usePlayer();
const absService = computed(() => new ABSService(props.auth.serverUrl, props.auth.user?.token || ''));

const showChapters = ref(false);
const showInfo = ref(false);
const isDownloaded = ref(false);
const isWishlisted = ref(false);
const liveTime = ref(Date.now()); 
let tickerInterval: any = null;

const activeItem = computed(() => state.activeItem || props.item);

// Reactive Download State from Global Queue
const downloadStatus = computed(() => downloadQueue.get(activeItem.value.id));
const isDownloading = computed(() => !!downloadStatus.value?.isDownloading);
const downloadProgress = computed(() => downloadStatus.value?.progress || 0);

const onPopState = () => {
  const hash = window.location.hash;
  if (showChapters.value && hash !== '#player-chapters') {
    showChapters.value = false;
  }
  if (showInfo.value && hash !== '#player-info') {
    showInfo.value = false;
  }
};

const openChapters = () => {
    window.history.pushState({ modal: 'chapters'}, '', '#player-chapters');
    showChapters.value = true;
};

const closeChapters = () => {
    if (window.location.hash === '#player-chapters') window.history.back();
    else showChapters.value = false;
};

const openInfoOverlay = () => {
    window.history.pushState({ modal: 'info'}, '', '#player-info');
    showInfo.value = true;
};

const closeInfoOverlay = () => {
    if (window.location.hash === '#player-info') window.history.back();
    else showInfo.value = false;
};

const coverUrl = computed(() => {
  const baseUrl = props.auth.serverUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  return `${baseUrl}/api/items/${activeItem.value.id}/cover?token=${props.auth.user?.token}`;
});

const isFinished = computed(() => activeItem.value?.userProgress?.isFinished || false);
const chapters = computed(() => activeItem.value.media.chapters || []);

const currentChapterIndex = computed(() => {
  if (chapters.value.length === 0) return -1;
  const time = state.currentTime + 0.1;
  return chapters.value.findIndex((ch, i) => 
    time >= ch.start && (i === chapters.value.length - 1 || time < (chapters[i+1]?.start || ch.end))
  );
});

const currentChapter = computed(() => currentChapterIndex.value !== -1 ? chapters.value[currentChapterIndex.value] : null);

const chapterProgressPercent = computed(() => {
  if (!currentChapter.value) return 0;
  const chapterDur = currentChapter.value.end - currentChapter.value.start;
  if (chapterDur <= 0) return 0;
  const elapsed = state.currentTime - currentChapter.value.start;
  return Math.max(0, Math.min(100, (elapsed / chapterDur) * 100));
});

const chapterTimeRemaining = computed(() => {
  if (!currentChapter.value) return 0;
  const rawRemaining = Math.max(0, currentChapter.value.end - state.currentTime);
  return rawRemaining / state.playbackRate;
});

const bookProgressPercent = computed(() => {
  if (state.duration <= 0) return 0;
  return (state.currentTime / state.duration) * 100;
});

const secondsToTimestamp = (s: number) => {
  if (isNaN(s) || s < 0) return "00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${sec.toString().padStart(2, '0')}`;
};

onMounted(async () => {
  if (state.activeItem?.id !== props.item.id) {
    load(props.item, props.auth);
  }
  checkDownloadStatus();
  checkWishlistStatus();
  window.addEventListener('popstate', onPopState);
  tickerInterval = setInterval(() => { liveTime.value = Date.now(); }, 1000);
});

const checkDownloadStatus = async () => {
  if (activeItem.value?.id) {
    isDownloaded.value = await OfflineManager.isDownloaded(activeItem.value.id);
  }
};

const checkWishlistStatus = async () => {
  if (activeItem.value?.id) {
    isWishlisted.value = await OfflineManager.isWishlisted(activeItem.value.id);
  }
};

onUnmounted(() => {
  window.removeEventListener('popstate', onPopState);
  if (tickerInterval) clearInterval(tickerInterval);
});

const togglePlay = () => state.isPlaying ? pause() : play();

const skipToNextChapter = () => {
  if (currentChapterIndex.value === -1 || currentChapterIndex.value >= chapters.value.length - 1) return;
  const next = chapters.value[currentChapterIndex.value + 1];
  seek(next.start);
};

const skipToPrevChapter = () => {
  if (currentChapterIndex.value <= 0) {
    seek(0);
    return;
  }
  if (state.currentTime - (currentChapter.value?.start || 0) > 4) {
    seek(currentChapter.value!.start);
  } else {
    const prev = chapters.value[currentChapterIndex.value - 1];
    seek(prev.start);
  }
};

const handleChapterSeek = (time: number) => seek(time);

const handleChapterProgressClick = (e: MouseEvent) => {
  if (!currentChapter.value) return;
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  const chapterDur = currentChapter.value.end - currentChapter.value.start;
  const targetTime = currentChapter.value.start + (ratio * chapterDur);
  seek(targetTime);
};

// --- Sleep Timer Logic ---
const isSleepActive = computed(() => state.sleepChapters > 0 || !!state.sleepEndTime);

const liveSleepCountdownText = computed(() => {
  if (state.sleepEndTime) {
    const diff = Math.max(0, state.sleepEndTime - liveTime.value) / 1000;
    if (diff <= 0) return null;
    return secondsToTimestamp(diff);
  } else if (state.sleepChapters > 0) {
     if (chapters.value.length === 0 || currentChapterIndex.value === -1) return null;
    let totalSeconds = Math.max(0, (currentChapter.value?.end || 0) - state.currentTime);
    for (let i = 1; i < state.sleepChapters; i++) {
       const nextCh = chapters.value[currentChapterIndex.value + i];
       if (nextCh) totalSeconds += (nextCh.end - nextCh.start);
       else break;
    }
    return `${secondsToTimestamp(totalSeconds / state.playbackRate)} • ${state.sleepChapters} CH`;
  }
  return null;
});

const cardSleepStatus = computed(() => {
  if (state.sleepChapters > 0) return `ACTIVE`; // Updated to simple status
  if (state.sleepEndTime) return 'TIMER ON';
  return 'OFF';
});

const adjustSleepTime = (secondsToAdd: number) => {
  let currentSeconds = 0;
  if (state.sleepEndTime) currentSeconds = Math.max(0, (state.sleepEndTime - liveTime.value) / 1000);
  const newTime = Math.max(0, currentSeconds + secondsToAdd);
  newTime <= 5 ? setSleepTimer(0) : setSleepTimer(newTime);
};

const adjustSleepChapters = (delta: number) => setSleepChapters(Math.max(0, state.sleepChapters + delta));

const metadata = computed(() => activeItem.value?.media?.metadata || {});
const derivedSeriesId = computed(() => {
  if (Array.isArray((metadata.value as any).series) && (metadata.value as any).series.length > 0) return (metadata.value as any).series[0].id;
  if (metadata.value.seriesId) return metadata.value.seriesId;
  return null;
});

const handleSeriesClick = (e: Event, explicitId?: string) => {
  e.stopPropagation(); 
  // Race Condition Fix: Emit immediately without manual back(), let App.vue handle global state reset
  const targetId = explicitId || derivedSeriesId.value;
  if (targetId) {
    emit('select-series', targetId);
  }
};

const handleToggleDownload = async () => {
  if (isDownloading.value) return; // Prevent double click
  if (isDownloaded.value) {
    if (confirm("Remove download?")) {
      await OfflineManager.deleteBook(activeItem.value.id);
      isDownloaded.value = false;
    }
  } else {
    try {
      // Start global download
      OfflineManager.startDownload(absService.value, activeItem.value).then(() => {
        isDownloaded.value = true;
      });
    } catch (e) {
      alert("Download failed.");
    }
  }
};

const handleToggleWishlist = async () => {
  const newState = await OfflineManager.toggleWishlist(activeItem.value);
  isWishlisted.value = newState;
};

const infoRows = computed(() => {
  const m = metadata.value;
  
  // NARRATOR LOGIC: Check Name -> Narrators Array -> Fallback
  let narrator = m.narratorName;
  if (!narrator && (m as any).narrators && Array.isArray((m as any).narrators) && (m as any).narrators.length > 0) {
    narrator = (m as any).narrators.join(', ');
  }
  if (!narrator) narrator = 'Multi-cast'; // Fallback if still empty

  // YEAR LOGIC: Check publishedYear -> publishedDate
  let year = m.publishedYear ? String(m.publishedYear) : null;
  if (!year && (m as any).publishedDate) {
    year = String((m as any).publishedDate).substring(0, 4);
  }

  // SERIES LOGIC: Check root seriesId, or extract from series array
  const seriesId = m.seriesId || (Array.isArray((m as any).series) && (m as any).series.length > 0 ? (m as any).series[0].id : null);
  
  const seriesName = m.seriesName || (Array.isArray((m as any).series) && (m as any).series.length > 0 ? (m as any).series[0].name : null);

  const rows = [
    { label: 'Narrator', value: narrator || 'Unknown', icon: Mic },
    { label: 'Duration', value: secondsToTimestamp(state.duration), icon: Clock },
    { label: 'Year', value: year || 'Unknown', icon: Calendar }
  ];

  if (seriesId && seriesName) {
    rows.splice(1, 0, { 
      label: 'Series', 
      value: seriesName, 
      icon: Layers, 
      isClickable: true,
      actionId: seriesId
    } as any);
  } else if (seriesName) {
      rows.splice(1, 0, { 
      label: 'Series', 
      value: seriesName, 
      icon: Layers, 
      isClickable: false
    } as any);
  }

  return rows;
});
</script>

<template>
  <div class="h-[100dvh] w-full bg-[#0d0d0d] text-white flex flex-col relative overflow-hidden font-sans select-none safe-top safe-bottom">
    
    <!-- Dynamic Blurred Cover Background -->
    <div 
      class="absolute inset-0 z-0 pointer-events-none bg-cover bg-center transition-all duration-1000 ease-in-out"
      :style="{ backgroundImage: `url(${coverUrl})` }"
      style="opacity: 0.15; filter: blur(40px);"
    />

    <Transition name="fade">
      <div v-if="state.isLoading" class="absolute inset-0 bg-[#0d0d0d] flex flex-col items-center justify-center gap-6 z-[100]">
        <div class="w-12 h-12 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
        <p class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-600">Accessing Portal...</p>
      </div>
    </Transition>

    <template v-if="!state.isLoading">
      <header class="px-6 py-4 md:py-6 flex justify-between items-center z-20 shrink-0">
        <button @click="emit('back')" class="p-2 text-neutral-600 hover:text-white transition-colors tap-effect">
          <ChevronDown :size="24" />
        </button>
        <button @click="openChapters" class="flex flex-col items-center gap-1 group tap-effect">
          <span class="text-[7px] font-black uppercase tracking-[0.5em] text-neutral-700 group-hover:text-purple-500 transition-colors">CHAPTER INDEX</span>
          <div class="flex items-center gap-2 max-w-[200px]">
            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-300 truncate">{{ currentChapter?.title || 'Segment 01' }}</span>
            <ChevronRight :size="12" class="text-neutral-700" />
          </div>
        </button>
        <div class="flex items-center gap-2">
          <button @click="handleToggleDownload" class="p-2 relative transition-colors group tap-effect" :class="isDownloaded ? 'text-purple-500' : 'text-neutral-600 hover:text-purple-400'">
            <div v-if="isDownloading" class="absolute inset-0 flex items-center justify-center">
               <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
                 <path class="text-neutral-800" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="4" />
                 <path class="text-purple-500 transition-all duration-300" :stroke-dasharray="downloadProgress + ', 100'" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="4" />
               </svg>
            </div>
            <CheckCircle v-else-if="isDownloaded" :size="22" />
            <Download v-else :size="22" />
          </button>
          <button @click="openInfoOverlay" class="p-2 text-neutral-600 hover:text-white transition-colors tap-effect"><Info :size="22" /></button>
        </div>
      </header>

      <div class="flex-1 w-full flex flex-col lg:flex-row overflow-hidden relative z-10 gap-4 lg:gap-0 min-h-0">
        <div class="flex-1 lg:w-[40%] flex flex-col items-center justify-center px-6 relative z-10 min-h-0 lg:pb-0">
          <div @click="openInfoOverlay" class="relative w-full max-w-[240px] md:max-w-[320px] aspect-[2/3] group cursor-pointer perspective-1000 shrink-0 mb-4 lg:mb-10 max-h-[40vh] md:max-h-[55vh] lg:max-h-[60vh] tap-effect">
            <div 
               class="absolute -inset-10 blur-[100px] rounded-full opacity-40 transition-colors duration-1000"
               :style="{ backgroundColor: state.accentColor }"
            />
            <div class="relative z-10 w-full h-full rounded-r-2xl rounded-l-sm overflow-hidden border border-white/10 shadow-[20px_20px_60px_-15px_rgba(0,0,0,0.8)] book-spine">
               <img :src="coverUrl" class="w-full h-full object-cover bg-black" />
            </div>
          </div>

          <div class="text-center space-y-2 w-full max-w-md px-4 z-10 shrink-0">
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-center gap-2">
                <h1 class="text-lg sm:text-2xl md:text-3xl font-black uppercase tracking-tight text-white leading-tight line-clamp-2 text-balance">{{ metadata.title }}</h1>
                <CheckCircle v-if="isFinished" class="text-green-500 shrink-0" :size="20" fill="currentColor" stroke-width="2" stroke="black" />
              </div>
              <p class="text-sm md:text-lg font-bold text-neutral-500 line-clamp-1">{{ metadata.authorName }}</p>
            </div>
            <!-- Updated Series Pill -->
            <button 
              v-if="metadata.seriesName" 
              @click="handleSeriesClick($event)" 
              class="group flex items-center justify-center gap-2 mx-auto px-4 py-1.5 rounded-full bg-purple-600 transition-all active:scale-95 shadow-md tap-effect"
            >
              <Layers :size="12" class="text-white" />
              <span class="text-white font-black text-[10px] md:text-xs uppercase tracking-wider">
                {{ metadata.seriesName }} {{ metadata.seriesSequence ? `#${metadata.seriesSequence}` : '' }}
              </span>
              <ArrowRight :size="12" class="text-white transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        <div class="shrink-0 lg:flex-1 lg:w-[60%] lg:h-full flex flex-col justify-end lg:justify-center px-6 pb-6 lg:pb-0 lg:px-24 space-y-6 lg:space-y-16 w-full max-w-xl lg:max-w-3xl mx-auto lg:mx-0 z-20">
          <div class="space-y-3">
            <div class="flex justify-between items-end mb-1 h-5 relative">
               <div class="flex flex-col">
                 <span class="text-[8px] font-black text-neutral-600 uppercase tracking-widest">Elapsed</span>
                 <span class="text-base md:text-lg font-extrabold font-mono-timer tracking-tighter text-white">{{ secondsToTimestamp(state.currentTime - (currentChapter?.start || 0)) }}</span>
               </div>
               
               <!-- Center info (Sleep Timer Active) -->
               <div v-if="liveSleepCountdownText" class="absolute left-1/2 -translate-x-1/2 bottom-0 flex items-center justify-center">
                 <!-- Hidden here to avoid duplication, handled in grid below now -->
               </div>

               <div class="flex flex-col items-end">
                 <span class="text-[8px] font-black text-neutral-600 uppercase tracking-widest">Remaining</span>
                 <span class="text-base md:text-lg font-extrabold font-mono-timer tracking-tighter text-neutral-400 shadow-none drop-shadow-none">-{{ secondsToTimestamp(chapterTimeRemaining) }}</span>
               </div>
            </div>
            <div class="h-3 w-full bg-neutral-900 rounded-full relative overflow-hidden shadow-inner border border-white/5 cursor-pointer tap-effect" @click="handleChapterProgressClick">
              <div class="h-full bg-[var(--player-accent)] shadow-[0_0_20px_var(--player-accent)] transition-all duration-300 rounded-r-full" :style="{ width: chapterProgressPercent + '%', '--player-accent': state.accentColor }" />
            </div>
            <div class="h-1 w-full bg-neutral-900/40 rounded-full relative overflow-hidden border border-white/5">
              <div class="h-full bg-neutral-600/50 transition-all duration-150" :style="{ width: bookProgressPercent + '%' }" />
            </div>
          </div>

          <!-- ENHANCED CONTROLS ROW -->
          <div class="flex items-center justify-center gap-6 md:gap-10 w-full px-4">
            <!-- Prev Chapter -->
            <button 
              @click="skipToPrevChapter" 
              class="p-2 text-neutral-500 hover:text-white transition-colors tap-effect"
              title="Previous Chapter"
            >
              <SkipBack :size="24" />
            </button>

            <!-- Rewind -->
            <button 
              @click="seek(state.currentTime - 10)" 
              class="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-200 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all tap-effect shadow-lg active:scale-95"
              title="Rewind 10s"
            >
              <RotateCcw :size="26" />
            </button>

            <!-- Play/Pause Main - UPDATED STYLE -->
            <button 
              @click="togglePlay" 
              class="w-20 h-20 md:w-24 md:h-24 rounded-full bg-[#a855f7] text-white flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.5)] active:scale-95 transition-all group relative tap-effect hover:scale-105"
            >
              <div v-if="state.isLoading" class="absolute inset-0 bg-white/20 rounded-full animate-ping" />
              <Pause v-if="state.isPlaying" :size="42" fill="currentColor" />
              <Play v-else :size="42" fill="currentColor" class="translate-x-1" />
            </button>

            <!-- Forward -->
            <button 
              @click="seek(state.currentTime + 30)" 
              class="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-200 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all tap-effect shadow-lg active:scale-95"
              title="Forward 30s"
            >
              <RotateCw :size="26" />
            </button>

            <!-- Next Chapter -->
            <button 
              @click="skipToNextChapter" 
              class="p-2 text-neutral-500 hover:text-white transition-colors tap-effect"
              title="Next Chapter"
            >
              <SkipForward :size="24" />
            </button>
          </div>

          <!-- BOTTOM GRID: Speed & Sleep -->
          <div class="grid grid-cols-2 gap-3 md:gap-4 w-full h-36 md:h-40">
            
            <!-- SPEED CONTROL CARD -->
            <div class="bg-neutral-900/50 backdrop-blur-md border border-white/5 rounded-2xl p-5 md:p-6 flex flex-col justify-between relative overflow-hidden group">
               <!-- Decorative Glow -->
               <div class="absolute -right-6 -top-6 w-20 h-20 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-colors pointer-events-none"></div>

               <div class="flex items-center gap-2 text-neutral-500 z-10 relative">
                  <Gauge :size="14" class="text-purple-400" />
                  <span class="text-[9px] font-black uppercase tracking-[0.2em]">Velocity</span>
               </div>
               
               <div class="flex-1 flex flex-col items-center justify-center z-10 relative">
                 <div class="flex items-baseline">
                   <span class="text-4xl md:text-5xl font-black font-mono tracking-tighter text-white drop-shadow-lg scale-110">{{ state.playbackRate.toFixed(1) }}</span>
                   <span class="text-lg md:text-xl font-bold text-neutral-600 ml-1">x</span>
                 </div>
               </div>
               
               <!-- Preset Pill Bar -->
               <div class="flex items-center justify-between w-full bg-black/40 rounded-lg p-1 z-10 relative border border-white/5">
                 <button @click="setPlaybackRate(1.0)" class="flex-1 py-1.5 text-[10px] font-black text-neutral-400 hover:text-white hover:bg-white/10 rounded transition-colors" :class="{ 'text-white bg-white/10': state.playbackRate === 1.0 }">1.0</button>
                 <button @click="setPlaybackRate(1.2)" class="flex-1 py-1.5 text-[10px] font-black text-neutral-400 hover:text-white hover:bg-white/10 rounded transition-colors" :class="{ 'text-white bg-white/10': state.playbackRate === 1.2 }">1.2</button>
                 <button @click="setPlaybackRate(1.5)" class="flex-1 py-1.5 text-[10px] font-black text-neutral-400 hover:text-white hover:bg-white/10 rounded transition-colors" :class="{ 'text-white bg-white/10': state.playbackRate === 1.5 }">1.5</button>
                 <button @click="setPlaybackRate(2.0)" class="flex-1 py-1.5 text-[10px] font-black text-neutral-400 hover:text-white hover:bg-white/10 rounded transition-colors" :class="{ 'text-white bg-white/10': state.playbackRate === 2.0 }">2.0</button>
               </div>
               
               <!-- Fine Tune (Hidden Overlay on Hover? Or just accessible via clicks) -->
               <!-- Keeping it simple with presets + stepper buttons might be too crowded. Let's add +/- to corners? -->
               <button @click="setPlaybackRate(Math.max(0.5, state.playbackRate - 0.1))" class="absolute left-2 top-1/2 -translate-y-1/2 p-2 text-neutral-600 hover:text-white active:scale-90 transition-all"><Minus :size="14" /></button>
               <button @click="setPlaybackRate(Math.min(3.0, state.playbackRate + 0.1))" class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-neutral-600 hover:text-white active:scale-90 transition-all"><Plus :size="14" /></button>
            </div>

            <!-- SLEEP TIMER CARD -->
            <div class="bg-neutral-900/50 backdrop-blur-md border border-white/5 rounded-2xl p-5 md:p-6 flex flex-col justify-between relative overflow-hidden group">
               <!-- Decorative Glow -->
               <div class="absolute -left-6 -top-6 w-20 h-20 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-colors pointer-events-none"></div>

               <div class="flex items-center justify-between z-10 relative">
                 <div class="flex items-center gap-2 text-neutral-500">
                    <Moon :size="14" class="text-blue-400" />
                    <span class="text-[9px] font-black uppercase tracking-[0.2em]">Sleep</span>
                 </div>
                 <div class="w-2 h-2 rounded-full" :class="isSleepActive ? 'bg-blue-500 animate-pulse' : 'bg-neutral-800'"></div>
               </div>
               
               <div class="flex-1 flex flex-col items-center justify-center z-10 relative">
                 <div v-if="liveSleepCountdownText" class="flex flex-col items-center animate-fade-in">
                    <span class="text-2xl md:text-3xl font-black font-mono tracking-tighter text-blue-100 drop-shadow-lg">{{ liveSleepCountdownText.split('•')[0] }}</span>
                    <span v-if="liveSleepCountdownText.includes('•')" class="text-[9px] font-black uppercase tracking-widest text-blue-400 mt-1">{{ liveSleepCountdownText.split('•')[1] }}</span>
                 </div>
                 <span v-else class="text-xs font-black uppercase tracking-widest text-neutral-700">Timer Off</span>
               </div>
               
               <!-- Control Pill Bar -->
               <div class="flex items-center gap-2 w-full z-10 relative">
                  <!-- Minutes Control -->
                  <div class="flex-1 flex items-center justify-between bg-black/40 rounded-lg p-1 border border-white/5">
                     <button @click="adjustSleepTime(-900)" class="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/10 rounded transition-colors"><Minus :size="12" /></button>
                     <span class="text-[9px] font-black text-neutral-300">MIN</span>
                     <button @click="adjustSleepTime(900)" class="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/10 rounded transition-colors"><Plus :size="12" /></button>
                  </div>
                  <!-- Chapter Control -->
                  <div class="flex-1 flex items-center justify-between bg-black/40 rounded-lg p-1 border border-white/5">
                     <button @click="adjustSleepChapters(-1)" class="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/10 rounded transition-colors"><Minus :size="12" /></button>
                     <span class="text-[9px] font-black text-neutral-300">CH</span>
                     <button @click="adjustSleepChapters(1)" class="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/10 rounded transition-colors"><Plus :size="12" /></button>
                  </div>
               </div>
            </div>

          </div>
        </div>
      </div>
    </template>
    
    <Transition name="fade">
      <div v-if="showInfo" class="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex flex-col p-8 overflow-hidden border border-white/5">
        <div class="flex justify-between items-center mb-8 shrink-0">
          <h2 class="text-2xl font-black uppercase tracking-tighter text-white">Artifact Data</h2>
          <button @click="closeInfoOverlay" class="p-3 bg-neutral-900 rounded-full text-neutral-500 hover:text-white transition-colors border border-white/5 tap-effect">
            <X :size="20" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar">
          <div class="max-w-2xl mx-auto space-y-8">
            <div class="flex flex-col items-center text-center space-y-4">
              <div class="w-40 h-60 rounded-lg shadow-2xl overflow-hidden border border-white/10">
                <img :src="coverUrl" class="w-full h-full object-cover" />
              </div>
              <div>
                <h3 class="text-2xl font-black uppercase leading-tight">{{ metadata.title }}</h3>
                <p class="text-neutral-500 font-bold">{{ metadata.authorName }}</p>
              </div>
            </div>
            <div class="flex justify-center">
              <button @click="handleToggleWishlist" class="px-6 py-3 bg-neutral-900 border border-white/10 rounded-full font-black uppercase tracking-widest text-xs hover:text-pink-400 hover:border-pink-500/30 transition-all flex items-center gap-2 active:scale-95 tap-effect" :class="{ 'text-pink-500 border-pink-500/50 bg-pink-500/10': isWishlisted, 'text-neutral-400': !isWishlisted }">
                 <Heart :size="14" :fill="isWishlisted ? 'currentColor' : 'none'" /> 
                 {{ isWishlisted ? 'Wishlisted' : 'Want to Listen' }}
              </button>
            </div>
            <div v-if="metadata.description" class="space-y-2">
              <h4 class="text-[10px] font-black uppercase tracking-widest text-neutral-600">Summary</h4>
              <div class="text-neutral-300 text-sm leading-relaxed whitespace-pre-line" v-html="metadata.description"></div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <component 
                  :is="row.isClickable ? 'button' : 'div'"
                  v-for="(row, i) in infoRows" 
                  :key="i" 
                  class="p-4 rounded-2xl flex flex-col gap-1 text-left transition-all relative overflow-hidden tap-effect"
                  :class="[
                    row.isClickable 
                      ? 'bg-purple-600 border border-purple-500/50 hover:bg-purple-500 cursor-pointer group active:scale-95 shadow-lg shadow-purple-900/20' 
                      : 'bg-white/5 border border-white/5'
                  ]"
                  @click="row.isClickable ? handleSeriesClick($event, row.actionId) : null"
                >
                <div class="flex items-center gap-2 mb-1" :class="row.isClickable ? 'text-purple-200' : 'text-neutral-500'">
                  <component :is="row.icon" :size="12" />
                  <span class="text-[9px] font-black uppercase tracking-widest">{{ row.label }}</span>
                </div>
                <div class="flex items-center justify-between w-full">
                  <span class="text-sm font-bold truncate w-full" :class="row.isClickable ? 'text-white' : 'text-white'">{{ row.value }}</span>
                  <ArrowRight v-if="row.isClickable" :size="16" class="text-white transition-transform group-hover:translate-x-1" />
                </div>
              </component>
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <ChapterEditor v-if="showChapters" :item="activeItem" :currentTime="state.currentTime" :isPlaying="state.isPlaying" @close="closeChapters" @seek="handleChapterSeek" />
  </div>
</template>