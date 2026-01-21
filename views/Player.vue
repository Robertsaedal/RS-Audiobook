<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { AuthState, ABSLibraryItem } from '../types';
import { usePlayer } from '../composables/usePlayer';
import { ABSService } from '../services/absService';
import { OfflineManager } from '../services/offlineManager';
import ChapterEditor from '../components/ChapterEditor.vue';
import { 
  ChevronDown, Play, Pause, Info, X, SkipBack, SkipForward,
  RotateCcw, RotateCw, ChevronRight, Moon, Plus, Minus, Mic, Clock, Layers, Download, CheckCircle, Loader2, BookOpen
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
const isDownloading = ref(false);
const downloadProgress = ref(0);

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
  if (!chapters.value || chapters.value.length === 0) return -1;
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

// Sleep Timer: Calculate total time until zzz
const sleepTimeRemaining = computed(() => {
  // 1. Check time-based timer first (Reactive via currentRealtime)
  if (state.sleepEndTime) {
    const remaining = Math.max(0, state.sleepEndTime - state.currentRealtime) / 1000;
    return remaining > 0 ? remaining : 0;
  }

  // 2. Fallback to Chapter-based timer
  if (state.sleepChapters <= 0 || currentChapterIndex.value === -1) return 0;
  
  let totalTime = Math.max(0, (currentChapter.value?.end || 0) - state.currentTime);
  const nextChaptersCount = state.sleepChapters - 1;
  for (let i = 1; i <= nextChaptersCount; i++) {
    const nextIdx = currentChapterIndex.value + i;
    const ch = chapters.value[nextIdx];
    if (ch) {
      totalTime += (ch.end - ch.start);
    }
  }
  
  return totalTime / state.playbackRate;
});

const secondsToTimestamp = (s: number) => {
  if (isNaN(s) || s < 0) return "00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${sec.toString().padStart(2, '0')}`;
};

onMounted(async () => {
  load(props.item, props.auth);
  checkDownloadStatus();
});

const checkDownloadStatus = async () => {
  if (activeItem.value?.id) {
    isDownloaded.value = await OfflineManager.isDownloaded(activeItem.value.id);
  }
};

onUnmounted(() => {
  destroy();
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
const increaseSleep = () => {
  // If we are currently in chapter mode or off, start 15m timer
  // If already in time mode, add 15m
  let currentSeconds = 0;
  if (state.sleepEndTime) {
    currentSeconds = Math.max(0, (state.sleepEndTime - state.currentRealtime) / 1000);
  }
  
  // Add 15 minutes (900 seconds)
  setSleepTimer(currentSeconds + 900);
};

const decreaseSleep = () => {
  if (state.sleepChapters > 0) {
    // If in chapter mode, just turn off
    setSleepTimer(0);
    return;
  }
  
  if (state.sleepEndTime) {
    const currentSeconds = Math.max(0, (state.sleepEndTime - state.currentRealtime) / 1000);
    const newTime = currentSeconds - 900;
    if (newTime <= 10) { // Buffer of 10s to just turn off
      setSleepTimer(0);
    } else {
      setSleepTimer(newTime);
    }
  }
};

const toggleChapterSleep = () => {
  // If currently in chapter mode (1 chapter), turn off
  if (state.sleepChapters > 0) {
    setSleepChapters(0);
  } else {
    // Set to End of Current Chapter (1 chapter)
    setSleepChapters(1);
  }
};

const metadata = computed(() => activeItem.value?.media?.metadata || {});

const derivedSeriesId = computed(() => {
  // 1. Explicit property
  if (metadata.value.seriesId) return metadata.value.seriesId;
  // 2. Nested series array
  if (Array.isArray((metadata.value as any).series) && (metadata.value as any).series.length > 0) {
    return (metadata.value as any).series[0].id;
  }
  return null;
});

const handleSeriesClick = (e: Event) => {
  e.stopPropagation(); // Explicitly prevent propagation
  if (derivedSeriesId.value) {
    emit('select-series', derivedSeriesId.value);
    showInfo.value = false;
  }
};

const handleToggleDownload = async () => {
  if (isDownloading.value) return;
  
  if (isDownloaded.value) {
    if (confirm("Remove download from local storage?")) {
      await OfflineManager.removeBook(activeItem.value.id);
      isDownloaded.value = false;
    }
  } else {
    isDownloading.value = true;
    downloadProgress.value = 0;
    try {
      await OfflineManager.saveBook(absService.value, activeItem.value, (pct) => {
        downloadProgress.value = pct;
      });
      isDownloaded.value = true;
    } catch (e) {
      console.error("Download failed", e);
      alert("Failed to download artifact.");
    } finally {
      isDownloading.value = false;
      downloadProgress.value = 0;
    }
  }
};

const infoRows = computed(() => {
  return [
    { label: 'Narrator', value: metadata.value.narratorName || 'Unknown', icon: Mic },
    { label: 'Series', value: metadata.value.seriesName || 'Standalone', icon: Layers, isClickable: !!derivedSeriesId.value },
    { label: 'Duration', value: secondsToTimestamp(state.duration), icon: Clock },
    { label: 'Year', value: metadata.value.publishedYear || 'Unknown', icon: Clock }
  ];
});
</script>

<template>
  <div class="h-[100dvh] w-full bg-[#0d0d0d] text-white flex flex-col relative overflow-hidden font-sans select-none safe-top safe-bottom">
    <div class="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
      <div class="w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[160px] animate-pulse" />
    </div>

    <Transition name="fade">
      <div v-if="state.isLoading" class="absolute inset-0 bg-[#0d0d0d] flex flex-col items-center justify-center gap-6 z-[100]">
        <div class="w-12 h-12 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
        <p class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-600">Establishing Archive Stream...</p>
      </div>
    </Transition>

    <template v-if="!state.isLoading">
      <!-- Top Navigation Header -->
      <header class="px-8 py-6 md:py-8 flex justify-between items-center z-20 shrink-0">
        <button @click="emit('back')" class="p-2 text-neutral-600 hover:text-white transition-colors active:scale-90">
          <ChevronDown :size="24" stroke-width="1.5" />
        </button>
        <button @click="showChapters = true" class="flex flex-col items-center gap-1 group">
          <span class="text-[7px] font-black uppercase tracking-[0.5em] text-neutral-700 group-hover:text-purple-500 transition-colors">CHAPTER INDEX</span>
          <div class="flex items-center gap-2 max-w-[200px]">
            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-300 truncate">{{ currentChapter?.title || 'Segment 01' }}</span>
            <ChevronRight :size="12" class="text-neutral-700" />
          </div>
        </button>
        <div class="flex items-center gap-2">
          <!-- Download Button with Progress -->
          <button @click="handleToggleDownload" class="p-2 relative transition-colors group" :class="isDownloaded ? 'text-purple-500' : 'text-neutral-600 hover:text-purple-400'">
            <div v-if="isDownloading" class="absolute inset-0 flex items-center justify-center">
               <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
                 <path class="text-neutral-800" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="4" />
                 <path class="text-purple-500 transition-all duration-200" :stroke-dasharray="downloadProgress + ', 100'" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="4" />
               </svg>
            </div>
            <CheckCircle v-else-if="isDownloaded" :size="22" stroke-width="1.5" />
            <Download v-else :size="22" stroke-width="1.5" />
          </button>

          <button @click="showInfo = true" class="p-2 text-neutral-600 hover:text-white transition-colors">
            <Info :size="22" stroke-width="1.5" />
          </button>
        </div>
      </header>

      <!-- Main Split Layout -->
      <!-- Flex Col for Mobile, Row for Desktop/Landscape -->
      <div class="flex-1 w-full h-full flex flex-col lg:flex-row overflow-hidden relative z-10">
        
        <!-- Left Column: Visuals & Metadata (40% Desktop) -->
        <div class="flex-1 lg:flex-none lg:w-[40%] flex flex-col items-center justify-center px-8 pb-4 lg:pb-0 relative z-10 min-h-0">
          <!-- Book Cover - Formatted as a Book (2:3 aspect) -->
          <!-- Constrained max-h for landscape tablets to ensure metadata visibility -->
          <div @click="showInfo = true" class="relative w-full max-w-[260px] md:max-w-[340px] aspect-[2/3] group cursor-pointer perspective-1000 shrink-0 mb-6 lg:mb-10 max-h-[45vh] lg:max-h-[65vh]">
            <div class="absolute -inset-10 bg-purple-600/5 blur-[100px] rounded-full opacity-50" />
            
            <div class="relative z-10 w-full h-full rounded-r-2xl rounded-l-sm overflow-hidden border-t border-r border-b border-white/10 shadow-[20px_20px_60px_-15px_rgba(0,0,0,0.8)] transition-transform duration-700 group-hover:scale-[1.02] group-hover:-translate-y-2 book-spine">
               <!-- Spine Highlight -->
               <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-r from-white/20 to-transparent z-20" />
               <div class="absolute left-1.5 top-0 bottom-0 w-px bg-black/40 z-20" />

               <img :src="coverUrl" class="w-full h-full object-contain bg-black" />
            </div>
          </div>

          <div class="text-center space-y-4 w-full max-w-md px-4 z-10">
            <!-- Updated Typography for Metadata -->
            <div class="space-y-2">
              <div class="flex items-center justify-center gap-3">
                <h1 class="text-2xl md:text-3xl font-black uppercase tracking-tight text-white leading-tight line-clamp-2" :title="metadata.title">
                  {{ metadata.title }}
                </h1>
                <CheckCircle v-if="isFinished" class="text-green-500 shrink-0" :size="24" fill="currentColor" stroke-width="2" stroke="black" />
              </div>
              <p class="text-lg font-bold text-neutral-500 line-clamp-1">
                {{ metadata.authorName }}
              </p>
            </div>
            
            <!-- Series Link (Visible and Clickable) - Moved/Styled as requested -->
            <button 
              v-if="metadata.seriesName" 
              @click="handleSeriesClick($event)"
              class="text-purple-400 font-semibold block mt-2 hover:text-purple-300 transition-colors text-sm uppercase tracking-widest truncate max-w-full mx-auto px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5"
            >
              {{ metadata.seriesName }} {{ metadata.seriesSequence ? `#${metadata.seriesSequence}` : '' }}
            </button>
          </div>
        </div>

        <!-- Right Column: Controls (60% Desktop) -->
        <div class="shrink-0 lg:flex-1 lg:w-[60%] lg:h-full flex flex-col justify-end lg:justify-center px-8 pb-12 lg:pb-0 lg:px-24 space-y-10 lg:space-y-16 w-full max-w-xl lg:max-w-3xl mx-auto lg:mx-0 z-20">
          
          <!-- Progress Area -->
          <div class="space-y-4">
            <div class="flex justify-between items-end mb-1">
               <div class="flex flex-col">
                 <span class="text-[8px] font-black text-neutral-600 uppercase tracking-widest">Chapter Elapsed</span>
                 <span class="text-lg font-black font-mono-timer tabular-nums tracking-tighter text-white">{{ secondsToTimestamp(state.currentTime - (currentChapter?.start || 0)) }}</span>
               </div>
               <div class="flex flex-col items-end">
                 <span class="text-[8px] font-black text-neutral-600 uppercase tracking-widest">Chapter Remaining</span>
                 <span class="text-lg font-black font-mono-timer tabular-nums tracking-tighter text-purple-500">-{{ secondsToTimestamp(chapterTimeRemaining) }}</span>
               </div>
            </div>

            <!-- Interactive Chapter Progress Bar -->
            <div 
              class="h-3 w-full bg-neutral-900 rounded-full relative overflow-hidden shadow-inner border border-white/5 cursor-pointer"
              @click="handleChapterProgressClick"
            >
              <div 
                class="h-full bg-purple-600 shadow-[0_0_20px_rgba(168,85,247,0.6)] transition-all duration-300 rounded-r-full" 
                :style="{ width: chapterProgressPercent + '%' }"
              />
            </div>

            <!-- Secondary Global Progress Bar -->
            <div class="h-1 w-full bg-neutral-900/40 rounded-full relative overflow-hidden border border-white/5 pointer-events-none">
              <div class="h-full bg-neutral-600/50 transition-all duration-150" :style="{ width: bookProgressPercent + '%' }" />
            </div>
          </div>

          <!-- Controls -->
          <div class="flex items-center justify-center gap-4 md:gap-8">
            <button @click="skipToPrevChapter" class="p-3 text-neutral-700 hover:text-purple-400 transition-colors active:scale-90"><SkipBack :size="20" /></button>
            <button @click="seek(state.currentTime - 10)" class="p-3 text-neutral-700 hover:text-white transition-colors active:scale-90"><RotateCcw :size="24" /></button>
            <button @click="togglePlay" class="w-20 h-20 rounded-full bg-purple-600/10 flex items-center justify-center border border-purple-500/20 shadow-[0_0_50px_rgba(157,80,187,0.1)] active:scale-95 transition-all group relative">
              <Pause v-if="state.isPlaying" :size="32" class="text-purple-500 fill-current" />
              <Play v-else :size="32" class="text-purple-500 fill-current translate-x-1" />
            </button>
            <button @click="seek(state.currentTime + 30)" class="p-3 text-neutral-700 hover:text-white transition-colors active:scale-90"><RotateCw :size="24" /></button>
            <button @click="skipToNextChapter" class="p-3 text-neutral-700 hover:text-purple-400 transition-colors active:scale-90"><SkipForward :size="20" /></button>
          </div>

          <!-- Speed & Sleep: Redesigned as requested -->
          <div class="flex flex-col gap-4 w-full">
            
            <!-- Speed Control Row -->
            <div class="flex items-center justify-between bg-neutral-900/40 border border-white/5 rounded-2xl px-4 py-3 hover:border-white/10 transition-colors">
               <div class="flex items-center gap-3 text-neutral-500">
                 <Clock :size="16" />
                 <span class="text-[9px] font-black uppercase tracking-[0.2em]">Speed</span>
               </div>
               
               <div class="flex items-center gap-6">
                 <button @click="setPlaybackRate(Math.max(0.5, state.playbackRate - 0.1))" class="p-2 text-neutral-400 hover:text-white transition-colors active:scale-90">
                   <Minus :size="16" />
                 </button>
                 <span class="text-sm font-black font-mono w-12 text-center text-white">{{ state.playbackRate.toFixed(1) }}x</span>
                 <button @click="setPlaybackRate(Math.min(3.0, state.playbackRate + 0.1))" class="p-2 text-neutral-400 hover:text-white transition-colors active:scale-90">
                   <Plus :size="16" />
                 </button>
               </div>
            </div>

            <!-- Sleep Timer Row -->
            <div class="flex items-center justify-between bg-neutral-900/40 border border-white/5 rounded-2xl px-4 py-3 hover:border-white/10 transition-colors">
               <div class="flex items-center gap-3 text-neutral-500">
                 <Moon :size="16" />
                 <span class="text-[9px] font-black uppercase tracking-[0.2em]">Sleep</span>
               </div>

               <div class="flex items-center gap-3">
                 <div class="flex items-center gap-4 border-r border-white/10 pr-4 mr-1">
                    <button @click="decreaseSleep" class="p-2 text-neutral-400 hover:text-white transition-colors active:scale-90">
                      <Minus :size="16" />
                    </button>
                    
                    <div class="flex flex-col items-center min-w-[70px]">
                        <span v-if="state.sleepChapters > 0" class="text-[10px] font-black text-purple-400 uppercase tracking-widest">End of Ch</span>
                        <span v-else-if="state.sleepEndTime" class="text-sm font-black font-mono text-white">{{ secondsToTimestamp(sleepTimeRemaining) }}</span>
                        <span v-else class="text-xs font-black text-neutral-600 uppercase tracking-widest">OFF</span>
                    </div>

                    <button @click="increaseSleep" class="p-2 text-neutral-400 hover:text-white transition-colors active:scale-90">
                      <Plus :size="16" />
                    </button>
                 </div>

                 <!-- Chapter Toggle Button -->
                 <button 
                   @click="toggleChapterSleep"
                   class="flex flex-col items-center justify-center p-2 rounded-lg transition-all"
                   :class="state.sleepChapters > 0 ? 'text-purple-400 bg-purple-500/10' : 'text-neutral-500 hover:text-white'"
                   title="Stop at End of Chapter"
                 >
                   <BookOpen :size="18" />
                 </button>
               </div>
            </div>

          </div>

        </div>
      </div>
    </template>

    <ChapterEditor 
      v-if="showChapters" 
      :item="activeItem" 
      :currentTime="state.currentTime"
      :isPlaying="state.isPlaying"
      @close="showChapters = false"
      @seek="handleChapterSeek"
    />

    <!-- Info Sheet -->
    <Transition name="slide-up">
      <div v-if="showInfo" class="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[160] flex flex-col">
        <header class="p-10 flex justify-between items-center bg-transparent shrink-0">
          <div class="space-y-1">
            <h2 class="text-xl font-black uppercase tracking-tighter text-white">ARTIFACT DETAILS</h2>
            <p class="text-[8px] font-black uppercase tracking-[0.5em] text-purple-700">Registry Inventory Record</p>
          </div>
          <button @click="showInfo = false" class="p-4 bg-neutral-900/50 rounded-full text-neutral-500 hover:text-white border border-white/5 transition-all"><X :size="20"/></button>
        </header>
        <div class="flex-1 overflow-y-auto p-10 space-y-12 max-w-2xl mx-auto w-full no-scrollbar pb-32">
          <div class="space-y-4">
            <div class="flex items-center gap-2 text-neutral-700"><Layers :size="14" /><span class="text-[9px] font-black uppercase tracking-[0.4em]">Artifact Summary</span></div>
            <h3 class="text-3xl font-black uppercase tracking-tighter text-white leading-tight">{{ metadata.title }}</h3>
            <p class="text-neutral-500 text-sm leading-relaxed">{{ metadata.description || 'No summary retrieved from repository.' }}</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-white/5 pt-12">
            <div v-for="row in infoRows" :key="row.label" class="flex flex-col gap-2">
              <div class="flex items-center gap-2 text-neutral-500"><component :is="row.icon" :size="12" /><span class="text-[9px] font-black uppercase tracking-[0.4em]">{{ row.label }}</span></div>
              <template v-if="row.isClickable"><button @click="handleSeriesClick($event)" class="text-left text-sm font-bold text-white hover:text-purple-400 transition-colors cursor-pointer w-fit py-1 px-3 bg-purple-600/10 border border-purple-500/20 rounded-full active:scale-95">{{ row.value }}</button></template>
              <template v-else><span class="text-sm font-bold text-white">{{ row.value }}</span></template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.4s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%); }

.perspective-1000 {
  perspective: 1000px;
}
.book-spine {
  border-left: 2px solid rgba(255,255,255,0.1);
  box-shadow: 
    inset 10px 0 20px rgba(0,0,0,0.5),
    10px 10px 30px rgba(0,0,0,0.5);
}

.shadow-aether-glow {
  text-shadow: 0 0 10px rgba(168, 85, 247, 0.6);
}
</style>