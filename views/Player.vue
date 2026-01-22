
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { AuthState, ABSLibraryItem } from '../types';
import { usePlayer } from '../composables/usePlayer';
import { ABSService } from '../services/absService';
import { OfflineManager } from '../services/offlineManager';
import ChapterEditor from '../components/ChapterEditor.vue';
import { 
  ChevronDown, Play, Pause, Info, X, SkipBack, SkipForward,
  RotateCcw, RotateCw, ChevronRight, Moon, Plus, Minus, Mic, Clock, Layers, Download, CheckCircle, BookOpen, Calendar
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

const { state, load, play, pause, seek, setPlaybackRate, setPreservesPitch, setSleepChapters, setSleepTimer, destroy } = usePlayer();
const absService = computed(() => new ABSService(props.auth.serverUrl, props.auth.user?.token || ''));

const showChapters = ref(false);
const showInfo = ref(false);
const isDownloaded = ref(false);
const isDownloading = ref(false);
const downloadProgress = ref(0);
const liveTime = ref(Date.now()); 

let tickerInterval: any = null;

const activeItem = computed(() => state.activeItem || props.item);

const coverUrl = computed(() => {
  const baseUrl = props.auth.serverUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  return `${baseUrl}/api/items/${activeItem.value.id}/cover?token=${props.auth.user?.token}`;
});

const isFinished = computed(() => {
  return activeItem.value?.userProgress?.isFinished || false;
});

const chapters = computed(() => {
  if (!activeItem.value?.media?.chapters) return [];
  return activeItem.value.media.chapters;
});

const currentChapterIndex = computed(() => {
  if (chapters.value.length === 0) return -1;
  const time = state.currentTime + 0.1;
  return chapters.value.findIndex((ch, i) => 
    time >= ch.start && (i === chapters.value.length - 1 || time < (chapters[i+1]?.start || ch.end))
  );
});

const currentChapter = computed(() => currentChapterIndex.value !== -1 ? chapters.value[currentChapterIndex.value] : null);

// Chapter specific progress Math
const chapterProgressPercent = computed(() => {
  if (!currentChapter.value) return 0;
  const chapterDur = currentChapter.value.end - currentChapter.value.start;
  if (chapterDur <= 0) return 0;
  const elapsed = state.currentTime - currentChapter.value.start;
  return Math.max(0, Math.min(100, (elapsed / chapterDur) * 100));
});

// Effective time remaining considers playback speed
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
  // If loading same item, don't re-init fully
  if (state.activeItem?.id !== props.item.id) {
    load(props.item, props.auth);
  }
  checkDownloadStatus();
  
  // Start local ticker for live countdowns
  tickerInterval = setInterval(() => {
    liveTime.value = Date.now();
  }, 1000);
});

const checkDownloadStatus = async () => {
  if (activeItem.value?.id) {
    isDownloaded.value = await OfflineManager.isDownloaded(activeItem.value.id);
  }
};

onUnmounted(() => {
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

const handleChapterSeek = (time: number) => {
  seek(time);
};

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

const cardSleepStatus = computed(() => {
  if (state.sleepChapters > 0) return `${state.sleepChapters} CH`;
  if (state.sleepEndTime) return 'TIMER ON';
  return 'OFF';
});

const liveSleepCountdown = computed(() => {
  if (state.sleepEndTime) {
    const diff = Math.max(0, state.sleepEndTime - liveTime.value) / 1000;
    if (diff <= 0) return null;
    return secondsToTimestamp(diff);
  }

  if (state.sleepChapters > 0) {
    if (chapters.value.length === 0 || currentChapterIndex.value === -1) return null;
    let totalSeconds = Math.max(0, (currentChapter.value?.end || 0) - state.currentTime);
    for (let i = 1; i < state.sleepChapters; i++) {
       const nextCh = chapters.value[currentChapterIndex.value + i];
       if (nextCh) totalSeconds += (nextCh.end - nextCh.start);
    }
    return `${secondsToTimestamp(totalSeconds / state.playbackRate)} • ${state.sleepChapters} CH`;
  }
  return null;
});

const adjustSleepTime = (secondsToAdd: number) => {
  let currentSeconds = 0;
  if (state.sleepEndTime) currentSeconds = Math.max(0, (state.sleepEndTime - liveTime.value) / 1000);
  const newTime = Math.max(0, currentSeconds + secondsToAdd);
  newTime <= 5 ? setSleepTimer(0) : setSleepTimer(newTime);
};

const adjustSleepChapters = (delta: number) => setSleepChapters(Math.max(0, state.sleepChapters + delta));
const setSleepToEndOfChapter = () => setSleepChapters(1);

const metadata = computed(() => activeItem.value?.media?.metadata || {});
const derivedSeriesId = computed(() => {
  if (Array.isArray((metadata.value as any).series) && (metadata.value as any).series.length > 0) return (metadata.value as any).series[0].id;
  if (metadata.value.seriesId) return metadata.value.seriesId;
  return null;
});

const handleSeriesClick = (e: Event) => {
  e.stopPropagation(); 
  if (derivedSeriesId.value) {
    emit('select-series', derivedSeriesId.value);
    showInfo.value = false;
  }
};

const handleToggleDownload = async () => {
  if (isDownloading.value) return;
  if (isDownloaded.value) {
    if (confirm("Remove download?")) {
      await OfflineManager.removeBook(activeItem.value.id);
      isDownloaded.value = false;
    }
  } else {
    isDownloading.value = true;
    try {
      await OfflineManager.saveBook(absService.value, activeItem.value, (pct) => downloadProgress.value = pct);
      isDownloaded.value = true;
    } catch (e) {
      alert("Download failed.");
    } finally {
      isDownloading.value = false;
      downloadProgress.value = 0;
    }
  }
};

const infoRows = computed(() => [
  { label: 'Narrator', value: metadata.value.narratorName || 'Unknown', icon: Mic },
  { label: 'Series', value: metadata.value.seriesName || 'Standalone', icon: Layers, isClickable: !!derivedSeriesId.value },
  { label: 'Duration', value: secondsToTimestamp(state.duration), icon: Clock },
  { label: 'Year', value: metadata.value.publishedYear || 'Unknown', icon: Calendar }
]);
</script>

<template>
  <div class="h-[100dvh] w-full bg-[#0d0d0d] text-white flex flex-col relative overflow-hidden font-sans select-none safe-top safe-bottom">
    
    <!-- Dynamic Glow Backdrop -->
    <div 
      class="absolute inset-0 z-0 pointer-events-none transition-colors duration-1000 ease-in-out"
      :style="{ backgroundColor: state.accentColor }"
      style="opacity: 0.15; filter: blur(80px);"
    />

    <Transition name="fade">
      <div v-if="state.isLoading" class="absolute inset-0 bg-[#0d0d0d] flex flex-col items-center justify-center gap-6 z-[100]">
        <div class="w-12 h-12 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
        <p class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-600">Accessing Portal...</p>
      </div>
    </Transition>

    <template v-if="!state.isLoading">
      <!-- Top Navigation -->
      <header class="px-8 py-6 md:py-8 flex justify-between items-center z-20 shrink-0">
        <button @click="emit('back')" class="p-2 text-neutral-600 hover:text-white transition-colors">
          <ChevronDown :size="24" />
        </button>
        <button @click="showChapters = true" class="flex flex-col items-center gap-1 group">
          <span class="text-[7px] font-black uppercase tracking-[0.5em] text-neutral-700 group-hover:text-purple-500 transition-colors">CHAPTER INDEX</span>
          <div class="flex items-center gap-2 max-w-[200px]">
            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-300 truncate">{{ currentChapter?.title || 'Segment 01' }}</span>
            <ChevronRight :size="12" class="text-neutral-700" />
          </div>
        </button>
        <div class="flex items-center gap-2">
          <button @click="handleToggleDownload" class="p-2 relative transition-colors group" :class="isDownloaded ? 'text-purple-500' : 'text-neutral-600 hover:text-purple-400'">
            <div v-if="isDownloading" class="absolute inset-0 flex items-center justify-center">
               <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
                 <path class="text-neutral-800" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="4" />
                 <path class="text-purple-500" :stroke-dasharray="downloadProgress + ', 100'" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="4" />
               </svg>
            </div>
            <CheckCircle v-else-if="isDownloaded" :size="22" />
            <Download v-else :size="22" />
          </button>
          <button @click="showInfo = true" class="p-2 text-neutral-600 hover:text-white transition-colors"><Info :size="22" /></button>
        </div>
      </header>

      <!-- Main Layout -->
      <div class="flex-1 w-full h-full flex flex-col lg:flex-row overflow-hidden relative z-10">
        <!-- Visuals -->
        <div class="flex-1 lg:flex-none lg:w-[40%] flex flex-col items-center justify-center px-8 pb-4 lg:pb-0 relative z-10 min-h-0">
          <div @click="showInfo = true" class="relative w-full max-w-[260px] md:max-w-[280px] aspect-[2/3] group cursor-pointer perspective-1000 shrink-0 mb-6 lg:mb-10 max-h-[35vh] lg:max-h-[50vh]">
            <div 
               class="absolute -inset-10 blur-[100px] rounded-full opacity-40 transition-colors duration-1000"
               :style="{ backgroundColor: state.accentColor }"
            />
            <div class="relative z-10 w-full h-full rounded-r-2xl rounded-l-sm overflow-hidden border border-white/10 shadow-[20px_20px_60px_-15px_rgba(0,0,0,0.8)] book-spine">
               <img :src="coverUrl" class="w-full h-full object-contain bg-black" />
            </div>
          </div>
          <div class="text-center space-y-4 w-full max-w-md px-4 z-10">
            <div class="space-y-2">
              <div class="flex items-center justify-center gap-3">
                <h1 class="text-2xl md:text-3xl font-black uppercase tracking-tight text-white leading-tight line-clamp-2">{{ metadata.title }}</h1>
                <CheckCircle v-if="isFinished" class="text-green-500 shrink-0" :size="24" fill="currentColor" stroke-width="2" stroke="black" />
              </div>
              <p class="text-lg font-bold text-neutral-500 line-clamp-1">{{ metadata.authorName }}</p>
            </div>
            <button v-if="metadata.seriesName" @click="handleSeriesClick" class="text-purple-400 font-semibold mt-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/5">{{ metadata.seriesName }} {{ metadata.seriesSequence ? `#${metadata.seriesSequence}` : '' }}</button>
          </div>
        </div>

        <!-- Controls -->
        <div class="shrink-0 lg:flex-1 lg:w-[60%] lg:h-full flex flex-col justify-end lg:justify-center px-8 pb-12 lg:pb-0 lg:px-24 space-y-10 lg:space-y-16 w-full max-w-xl lg:max-w-3xl mx-auto lg:mx-0 z-20">
          <!-- Progress -->
          <div class="space-y-4">
            <div v-if="liveSleepCountdown" class="flex justify-center mb-2">
               <span class="text-[10px] font-black tracking-widest text-purple-400 animate-pulse shadow-aether-glow">{{ liveSleepCountdown }} REMAINING</span>
            </div>
            <div class="flex justify-between items-end mb-1 h-5">
               <div class="flex flex-col">
                 <span class="text-[8px] font-black text-neutral-600 uppercase tracking-widest">Elapsed</span>
                 <span class="text-lg font-black font-mono-timer tracking-tighter text-white">{{ secondsToTimestamp(state.currentTime - (currentChapter?.start || 0)) }}</span>
               </div>
               <div class="flex flex-col items-end">
                 <span class="text-[8px] font-black text-neutral-600 uppercase tracking-widest">Remaining</span>
                 <span class="text-lg font-black font-mono-timer tracking-tighter text-purple-500">-{{ secondsToTimestamp(chapterTimeRemaining) }}</span>
               </div>
            </div>
            <div class="h-3 w-full bg-neutral-900 rounded-full relative overflow-hidden shadow-inner border border-white/5 cursor-pointer" @click="handleChapterProgressClick">
              <div class="h-full bg-[var(--player-accent)] shadow-[0_0_20px_var(--player-accent)] transition-all duration-300 rounded-r-full" :style="{ width: chapterProgressPercent + '%', '--player-accent': state.accentColor }" />
            </div>
            <div class="h-1 w-full bg-neutral-900/40 rounded-full relative overflow-hidden border border-white/5">
              <div class="h-full bg-neutral-600/50 transition-all duration-150" :style="{ width: bookProgressPercent + '%' }" />
            </div>
          </div>

          <!-- Playback Buttons -->
          <div class="flex items-center justify-center gap-4 md:gap-8">
            <button @click="skipToPrevChapter" class="p-3 text-neutral-700 hover:text-purple-400"><SkipBack :size="20" /></button>
            <button @click="seek(state.currentTime - 10)" class="p-3 text-neutral-700 hover:text-white"><RotateCcw :size="24" /></button>
            <button 
              @click="togglePlay" 
              class="w-20 h-20 rounded-full bg-purple-600/10 flex items-center justify-center border border-purple-500/30 shadow-[0_0_50px_rgba(168,85,247,0.2)] active:scale-95 transition-all group relative"
            >
              <Pause v-if="state.isPlaying" :size="32" class="text-purple-500 fill-current" />
              <Play v-else :size="32" class="text-purple-500 fill-current translate-x-1" />
            </button>
            <button @click="seek(state.currentTime + 30)" class="p-3 text-neutral-700 hover:text-white"><RotateCw :size="24" /></button>
            <button @click="skipToNextChapter" class="p-3 text-neutral-700 hover:text-purple-400"><SkipForward :size="20" /></button>
          </div>

          <!-- Mini Cards -->
          <div class="grid grid-cols-2 gap-4 w-full">
            <div class="bg-neutral-900/50 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex flex-col justify-between gap-2 h-32 relative overflow-hidden">
               <div class="flex justify-between items-center px-1">
                   <div class="flex items-center gap-2 text-neutral-500"><Clock :size="14" /><span class="text-[9px] font-black uppercase tracking-[0.2em]">Speed</span></div>
                   <button @click="setPreservesPitch(!state.preservesPitch)" class="flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all" :class="state.preservesPitch ? 'bg-purple-600/20 border-purple-500/30 text-purple-400' : 'bg-white/5 border-white/5 text-neutral-600'">
                      <div class="w-1.5 h-1.5 rounded-full" :class="state.preservesPitch ? 'bg-purple-500 shadow-[0_0_8px_#A855F7]' : 'bg-neutral-600'" />
                      <span class="text-[8px] font-black uppercase">Natural</span>
                   </button>
               </div>
               <div class="flex-1 flex flex-col items-center justify-center"><span class="text-3xl font-black font-mono tracking-tighter text-white">{{ state.playbackRate.toFixed(1) }}x</span></div>
               <div class="flex items-center gap-4 w-full justify-center">
                 <button @click="setPlaybackRate(Math.max(0.5, state.playbackRate - 0.1))" class="p-2 bg-white/5 rounded-full text-neutral-400"><Minus :size="16" /></button>
                 <button @click="setPlaybackRate(Math.min(3.0, state.playbackRate + 0.1))" class="p-2 bg-white/5 rounded-full text-neutral-400"><Plus :size="16" /></button>
               </div>
            </div>

            <div class="bg-neutral-900/50 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex flex-col justify-between gap-2 h-32 relative overflow-hidden group">
               <div class="flex justify-between items-center px-1">
                 <div class="flex items-center gap-2 text-neutral-500"><Moon :size="14" /><span class="text-[9px] font-black uppercase tracking-[0.2em]">SLEEP</span></div>
                 <span class="text-[10px] font-black font-mono" :class="isSleepActive ? 'text-purple-400' : 'text-neutral-600'">{{ cardSleepStatus }}</span>
               </div>
               <div class="flex-1 flex flex-col justify-end gap-2">
                 <div class="flex items-center justify-between bg-white/5 rounded-lg p-1.5 px-2">
                    <span class="text-[8px] font-bold uppercase text-neutral-500">MINS</span>
                    <div class="flex items-center gap-2">
                       <button @click="adjustSleepTime(-900)" class="w-6 h-6 flex items-center justify-center bg-white/5 rounded text-neutral-400"><Minus :size="12" /></button>
                       <span class="text-[9px] font-black w-6 text-center">15</span>
                       <button @click="adjustSleepTime(900)" class="w-6 h-6 flex items-center justify-center bg-white/5 rounded text-neutral-400"><Plus :size="12" /></button>
                    </div>
                 </div>
                 <div class="flex items-center justify-between bg-white/5 rounded-lg p-1.5 px-2">
                    <span class="text-[8px] font-bold uppercase text-neutral-500">CH</span>
                    <div class="flex items-center gap-2">
                       <button @click="adjustSleepChapters(-1)" class="w-6 h-6 flex items-center justify-center bg-white/5 rounded text-neutral-400"><Minus :size="12" /></button>
                       <button @click="setSleepToEndOfChapter" class="text-neutral-500 hover:text-purple-400"><BookOpen :size="14" /></button>
                       <button @click="adjustSleepChapters(1)" class="w-6 h-6 flex items-center justify-center bg-white/5 rounded text-neutral-400"><Plus :size="12" /></button>
                    </div>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    
    <!-- Info Overlay -->
    <Transition name="fade">
      <div v-if="showInfo" class="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex flex-col p-8 overflow-hidden">
        <div class="flex justify-between items-center mb-8 shrink-0">
          <h2 class="text-2xl font-black uppercase tracking-tighter text-white">Artifact Data</h2>
          <button @click="showInfo = false" class="p-3 bg-neutral-900 rounded-full text-neutral-500 hover:text-white transition-colors border border-white/5">
            <X :size="20" />
          </button>
        </div>
        
        <div class="flex-1 overflow-y-auto custom-scrollbar">
          <div class="max-w-2xl mx-auto space-y-8">
            <!-- Cover & Title -->
            <div class="flex flex-col items-center text-center space-y-4">
              <div class="w-40 h-60 rounded-lg shadow-2xl overflow-hidden border border-white/10">
                <img :src="coverUrl" class="w-full h-full object-cover" />
              </div>
              <div>
                <h3 class="text-2xl font-black uppercase leading-tight">{{ metadata.title }}</h3>
                <p class="text-neutral-500 font-bold">{{ metadata.authorName }}</p>
              </div>
            </div>

            <!-- Grid Stats -->
            <div class="grid grid-cols-2 gap-4">
              <div 
                v-for="(row, i) in infoRows" 
                :key="i" 
                class="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col gap-1"
                :class="row.isClickable ? 'cursor-pointer hover:bg-purple-600/10 hover:border-purple-500/30' : ''"
                @click="row.isClickable ? handleSeriesClick($event) : null"
              >
                <div class="flex items-center gap-2 text-neutral-500 mb-1">
                  <component :is="row.icon" :size="12" />
                  <span class="text-[9px] font-black uppercase tracking-widest">{{ row.label }}</span>
                </div>
                <span class="text-sm font-bold text-white truncate" :class="row.isClickable ? 'text-purple-400' : ''">{{ row.value }}</span>
              </div>
            </div>

            <!-- Description -->
            <div v-if="metadata.description" class="space-y-2">
              <h4 class="text-[10px] font-black uppercase tracking-widest text-neutral-600">Summary</h4>
              <div class="text-neutral-300 text-sm leading-relaxed whitespace-pre-line" v-html="metadata.description"></div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <ChapterEditor v-if="showChapters" :item="activeItem" :currentTime="state.currentTime" :isPlaying="state.isPlaying" @close="showChapters = false" @seek="handleChapterSeek" />
  </div>
</template>
