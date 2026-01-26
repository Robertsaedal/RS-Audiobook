
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue';
import { TranscriptionService } from '../services/transcriptionService';
import { db, TranscriptCue } from '../services/db';
import { ABSLibraryItem } from '../types';
import { ABSService } from '../services/absService';
import { usePlayer } from '../composables/usePlayer';
import { X, Volume2, FileText, Send, CheckCircle, Loader2, RefreshCw, DownloadCloud, Sparkles, Maximize2, Minimize2, Play, Pause, RotateCcw, RotateCw } from 'lucide-vue-next';
import confetti from 'canvas-confetti';

const props = defineProps<{
  item: ABSLibraryItem,
  currentTime: number,
  absService?: ABSService | null
}>();

const emit = defineEmits<{
  (e: 'close'): void,
  (e: 'seek', time: number): void
}>();

const { state: playerState, play, pause, seek } = usePlayer();

const cues = ref<TranscriptCue[]>([]);
const hasTranscript = ref(false);
const isLoading = ref(false);
const activeCueIndex = ref(-1);
const scrollContainer = ref<HTMLElement | null>(null);
const isUserScrolling = ref(false);
const isFullscreen = ref(false);
let userScrollTimeout: any = null;

const flowState = ref<'idle' | 'scanning' | 'found' | 'downloading' | 'ready' | 'empty'>('idle');
const candidateFile = ref<{ url: string, name: string } | null>(null);

// VIRTUAL WINDOWING CONFIG - PERFORMANCE OPTIMIZED
const WINDOW_SIZE = 15; 
const APPROX_ITEM_HEIGHT = 90; 

const initialCheck = async () => {
  isLoading.value = true;
  try {
    const record = await db.transcripts.get(props.item.id);
    if (record && record.cues && record.cues.length > 0) {
      cues.value = record.cues;
      hasTranscript.value = true;
      flowState.value = 'ready';
    } else {
      scanServer();
    }
  } catch (e) {
    flowState.value = 'idle';
  } finally {
    isLoading.value = false;
  }
};

const scanServer = async () => {
  flowState.value = 'scanning';
  try {
    const candidate = await TranscriptionService.scanForCandidate(props.item.id, props.absService || null);
    if (candidate) {
      candidateFile.value = candidate;
      flowState.value = 'found';
    } else {
      flowState.value = 'empty';
    }
  } catch (e) {
    flowState.value = 'empty';
  }
};

const downloadTranscript = async () => {
  if (!candidateFile.value) return;
  flowState.value = 'downloading';
  try {
    const result = await TranscriptionService.downloadAndCache(props.item.id, candidateFile.value.url, candidateFile.value.name);
    if (result) {
      setTimeout(() => {
        cues.value = result;
        hasTranscript.value = true;
        flowState.value = 'ready';
        confetti({
          particleCount: 30,
          spread: 50,
          origin: { y: 0.6 },
          colors: ['#A855F7', '#FFFFFF']
        });
      }, 50);
    } else {
      flowState.value = 'empty';
    }
  } catch (e) {
    flowState.value = 'empty';
  }
};

// VIRTUAL RENDERING LOGIC
const renderRange = computed(() => {
  if (cues.value.length === 0) return { start: 0, end: 0 };
  const start = Math.max(0, activeCueIndex.value - WINDOW_SIZE);
  const end = Math.min(cues.value.length, activeCueIndex.value + WINDOW_SIZE);
  return { start, end };
});

const visibleCues = computed(() => {
  const { start, end } = renderRange.value;
  return cues.value.slice(start, end).map((cue, i) => ({
    cue,
    originalIndex: start + i
  }));
});

const topPaddingHeight = computed(() => renderRange.value.start * APPROX_ITEM_HEIGHT);
const bottomPaddingHeight = computed(() => (cues.value.length - renderRange.value.end) * APPROX_ITEM_HEIGHT);

const handleCueClick = (cue: TranscriptCue) => {
  if (cue && typeof cue.start === 'number') {
    seek(cue.start);
  }
};

const togglePlay = () => playerState.isPlaying ? pause() : play();
const rewind = () => seek(playerState.currentTime - 10);
const forward = () => seek(playerState.currentTime + 30);

// OPTIMIZED SEARCH POINTER
let lastKnownIndex = 0;
let lastScrollUpdate = 0;

watch(() => props.currentTime, (time) => {
  // PERFORMANCE: Immediate exit if user is interacting or no data
  if (isUserScrolling.value || cues.value.length === 0) return;
  
  // PERFORMANCE: Check current pointer range first before searching
  const current = cues.value[lastKnownIndex];
  if (current && time >= current.start && time <= current.end) {
    if (activeCueIndex.value !== lastKnownIndex) {
      activeCueIndex.value = lastKnownIndex;
    }
    return;
  }

  // PERFORMANCE: Pointer-based search
  let newIdx = -1;
  
  // Search forward from last position (most likely case)
  for (let i = lastKnownIndex; i < cues.value.length; i++) {
    const c = cues.value[i];
    if (time >= c.start && time <= c.end) {
      newIdx = i;
      break;
    }
  }

  // Fallback: Full search (only if forward search fails)
  if (newIdx === -1) {
    newIdx = cues.value.findIndex(c => time >= c.start && time <= c.end);
  }
  
  if (newIdx !== -1 && newIdx !== activeCueIndex.value) {
      activeCueIndex.value = newIdx;
      lastKnownIndex = newIdx;
      
      const now = Date.now();
      // PERFORMANCE: Throttle scrolling to once every 300ms
      if (now - lastScrollUpdate > 300) { 
        scrollToActive();
        lastScrollUpdate = now;
      }
  }
});

const onScroll = () => {
  isUserScrolling.value = true;
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
  userScrollTimeout = setTimeout(() => {
    isUserScrolling.value = false;
  }, 3000); 
};

const scrollToActive = () => {
  nextTick(() => {
    if (!scrollContainer.value) return;
    const activeEl = scrollContainer.value.querySelector('.active-cue');
    if (activeEl) {
      // PERFORMANCE: Use auto behavior to prevent JS thread locking during virtual updates
      activeEl.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  });
};

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
  setTimeout(scrollToActive, 350);
};

onMounted(initialCheck);
onUnmounted(() => { if (userScrollTimeout) clearTimeout(userScrollTimeout); });
</script>

<template>
  <Teleport to="body" :disabled="!isFullscreen">
    <div 
      class="flex flex-col overflow-hidden transition-all duration-300 ease-in-out"
      :class="[
        isFullscreen 
          ? 'fixed inset-0 z-[1000] bg-[#0d0d12] rounded-none' 
          : 'w-full h-full bg-[#0f0f14]/80 backdrop-blur-[25px] border border-white/10 rounded-[32px] shadow-2xl relative'
      ]"
    >
      
      <!-- Header -->
      <div class="flex items-center justify-between p-5 border-b border-white/5 bg-black/40 z-20 shrink-0">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <FileText :size="16" />
          </div>
          <div>
            <h2 class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Transcript Archives</h2>
            <p v-if="flowState === 'ready'" class="text-[8px] font-bold text-emerald-400 uppercase tracking-widest">Active & Synced</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button @click="toggleFullscreen" class="p-2 bg-white/5 rounded-full text-neutral-400 hover:text-white border border-white/5 tap-effect">
            <Minimize2 v-if="isFullscreen" :size="16" />
            <Maximize2 v-else :size="16" />
          </button>
          <button @click="emit('close')" class="p-2 bg-white/5 rounded-full text-neutral-400 hover:text-white border border-white/5 tap-effect">
            <X :size="16" />
          </button>
        </div>
      </div>

      <!-- Main Content Area -->
      <div 
        ref="scrollContainer" 
        @scroll="onScroll"
        class="flex-1 overflow-y-auto purple-scrollbar p-6 relative w-full scroll-smooth"
        style="-webkit-overflow-scrolling: touch;"
      >
        
        <!-- INITIAL / SCANNING STATES -->
        <div v-if="flowState !== 'ready'" class="h-full flex flex-col items-center justify-center text-center space-y-8 animate-fade-in-up">
          <div v-if="flowState === 'found'" class="space-y-6">
             <div class="w-20 h-20 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto">
                <Sparkles :size="32" class="text-purple-400" />
             </div>
             <div>
               <h3 class="text-sm font-black uppercase tracking-widest text-white">Transcript Found</h3>
               <p class="text-[10px] text-neutral-500 mt-2 max-w-[200px] mx-auto leading-relaxed">Local records available for this artifact.</p>
             </div>
             <button @click="downloadTranscript" class="px-8 py-3 bg-purple-600 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-full transition-all active:scale-95 shadow-lg flex items-center gap-3 mx-auto">
               <DownloadCloud :size="14" />
               <span>Store Artifact</span>
             </button>
          </div>

          <div v-else-if="flowState === 'scanning' || flowState === 'downloading'" class="space-y-4">
             <Loader2 :size="32" class="text-purple-500 animate-spin mx-auto" />
             <p class="text-[9px] font-black uppercase tracking-widest text-neutral-500">
               {{ flowState === 'scanning' ? 'Querying Index...' : 'Compiling Transcript...' }}
             </p>
          </div>

          <div v-else-if="flowState === 'empty'" class="space-y-6 opacity-60">
             <div class="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center mx-auto">
                <FileText :size="24" class="text-neutral-600" />
             </div>
             <p class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Transcript Unknown</p>
             <button @click="scanServer" class="text-[9px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2 mx-auto">
                <RefreshCw :size="10" /> Re-Sync
             </button>
          </div>
        </div>

        <!-- VIRTUAL TRANSCRIPT LIST - CENTERED TEXT -->
        <div v-else class="flex flex-col items-center w-full min-h-full">
          <div :style="{ height: topPaddingHeight + 'px' }" class="w-full shrink-0"></div>

          <div class="w-full space-y-2 py-[30vh] flex flex-col items-center">
            <div 
              v-for="item in visibleCues" 
              :key="item.originalIndex"
              @click="handleCueClick(item.cue)"
              class="cue-line cursor-pointer p-4 rounded-3xl w-full max-w-2xl text-center"
              :class="[
                activeCueIndex === item.originalIndex 
                  ? 'active-cue opacity-100' 
                  : 'opacity-20 hover:opacity-40'
              ]"
            >
              <div v-if="item.cue.speaker && activeCueIndex === item.originalIndex" class="mb-2 flex justify-center items-center gap-2">
                 <span class="text-[8px] font-black uppercase tracking-widest text-purple-400 border border-purple-400/30 px-2 py-0.5 rounded-md">
                   {{ item.cue.speaker }}
                 </span>
              </div>

              <p 
                class="font-black leading-tight tracking-tight text-center"
                :class="[
                   activeCueIndex === item.originalIndex ? 'text-white text-2xl md:text-4xl' : 'text-neutral-500 text-lg md:text-xl'
                ]"
              >
                {{ item.cue.text }}
              </p>

              <div v-if="item.cue.background_noise && activeCueIndex === item.originalIndex" class="mt-2 flex justify-center items-center gap-1.5 text-neutral-500">
                 <Volume2 :size="10" />
                 <span class="text-[8px] font-bold italic tracking-wider">{{ item.cue.background_noise }}</span>
              </div>
            </div>
          </div>

          <div :style="{ height: bottomPaddingHeight + 'px' }" class="w-full shrink-0"></div>
        </div>

      </div>

      <!-- Fullscreen Mini Player Controls -->
      <div v-if="isFullscreen && flowState === 'ready'" class="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
         <div class="flex items-center gap-4 bg-black/90 backdrop-blur-2xl border border-white/10 p-2 rounded-full shadow-[0_20px_60px_rgba(0,0,0,1)]">
            <button @click="rewind" class="p-3 text-neutral-400 hover:text-white rounded-full tap-effect">
               <RotateCcw :size="20" />
            </button>
            <button @click="togglePlay" class="w-14 h-14 flex items-center justify-center bg-purple-600 text-white rounded-full shadow-[0_0_30px_rgba(168,85,247,0.5)] active:scale-95 transition-transform">
               <Pause v-if="playerState.isPlaying" :size="24" fill="currentColor" />
               <Play v-else :size="24" fill="currentColor" class="translate-x-0.5" />
            </button>
            <button @click="forward" class="p-3 text-neutral-400 hover:text-white rounded-full tap-effect">
               <RotateCw :size="20" />
            </button>
         </div>
      </div>

    </div>
  </Teleport>
</template>

<style scoped>
.purple-scrollbar::-webkit-scrollbar { width: 2px; }
.purple-scrollbar::-webkit-scrollbar-thumb { background: #A855F7; border-radius: 10px; }
.purple-scrollbar::-webkit-scrollbar-track { background: transparent; }

.active-cue {
  scroll-margin-block: 40vh;
}

.cue-line {
  /* PERFORMANCE: Use translateZ and specific will-change to force GPU layer */
  transform: translateZ(0);
  will-change: opacity;
  transition: opacity 0.3s ease;
  contain: paint;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.5s ease-out forwards;
}
</style>
