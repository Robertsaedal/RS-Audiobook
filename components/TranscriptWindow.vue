
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
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

// Global Player Access
const { state: playerState, play, pause, seek } = usePlayer();

const cues = ref<TranscriptCue[]>([]);
const hasTranscript = ref(false);
const isLoading = ref(false);
const activeCueIndex = ref(-1);
const scrollContainer = ref<HTMLElement | null>(null);
const isUserScrolling = ref(false);
const isFullscreen = ref(false);
let userScrollTimeout: any = null;

// Manual Flow States
const flowState = ref<'idle' | 'scanning' | 'found' | 'downloading' | 'ready' | 'empty'>('idle');
const candidateFile = ref<{ url: string, name: string } | null>(null);

const initialCheck = async () => {
  isLoading.value = true;
  try {
    const record = await db.transcripts.get(props.item.id);
    if (record && record.cues && record.cues.length > 0) {
      cues.value = record.cues;
      hasTranscript.value = true;
      flowState.value = 'ready';
    } else {
      // If not in DB, start scan automatically
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
      cues.value = result;
      hasTranscript.value = true;
      flowState.value = 'ready';
      
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#A855F7', '#FFFFFF']
      });
    } else {
      flowState.value = 'empty';
    }
  } catch (e) {
    flowState.value = 'empty';
  }
};

const handleCueClick = (cue: TranscriptCue) => {
  if (cue && typeof cue.start === 'number') {
    // Seek using global player to ensure sync
    seek(cue.start);
  }
};

const togglePlay = () => {
  playerState.isPlaying ? pause() : play();
};

const rewind = () => seek(playerState.currentTime - 10);
const forward = () => seek(playerState.currentTime + 30);

// Optimized Scroll Sync
watch(() => props.currentTime, (time) => {
  if (cues.value.length === 0) return;
  
  // Find index using binary search or simple find (simple find is fine for transcript sizes)
  const idx = cues.value.findIndex(c => time >= c.start && time <= c.end);
  
  if (idx !== -1 && idx !== activeCueIndex.value) {
      activeCueIndex.value = idx;
      if (!isUserScrolling.value) scrollToActive();
  }
});

const onScroll = () => {
  isUserScrolling.value = true;
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
  userScrollTimeout = setTimeout(() => {
    isUserScrolling.value = false;
  }, 4000); 
};

const scrollToActive = () => {
  nextTick(() => {
    if (!scrollContainer.value) return;
    const activeEl = scrollContainer.value.querySelector('.active-cue');
    if (activeEl) {
      // Use block: 'center' with behavior 'smooth' but guarded by user scroll
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
};

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
  // Re-center active cue after layout change
  setTimeout(scrollToActive, 300);
};

onMounted(() => {
  initialCheck();
});

onUnmounted(() => {
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
});
</script>

<template>
  <div 
    class="bg-[#0f0f14]/70 backdrop-blur-[25px] border border-white/10 flex flex-col overflow-hidden relative shadow-2xl transition-all duration-500 ease-in-out"
    :class="isFullscreen ? 'fixed inset-0 z-[300] rounded-none' : 'w-full h-full rounded-[32px]'"
  >
    
    <!-- Header -->
    <div class="flex items-center justify-between p-5 border-b border-white/5 bg-black/20 z-20 shrink-0">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-full bg-purple-500/10 text-purple-400">
          <FileText :size="16" />
        </div>
        <div>
          <h2 class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Transcript Archives</h2>
          <p v-if="flowState === 'ready'" class="text-[8px] font-bold text-emerald-400 uppercase tracking-widest">Active & Synced</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button 
          @click="toggleFullscreen" 
          class="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white border border-white/5"
        >
          <Minimize2 v-if="isFullscreen" :size="16" />
          <Maximize2 v-else :size="16" />
        </button>
        <button @click="emit('close')" class="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white border border-white/5">
          <X :size="16" />
        </button>
      </div>
    </div>

    <!-- Main Content Area -->
    <div 
      ref="scrollContainer" 
      @scroll="onScroll"
      class="flex-1 overflow-y-auto purple-scrollbar p-6 relative w-full"
    >
      
      <!-- INITIAL / SCANNING STATES -->
      <div v-if="flowState !== 'ready'" class="h-full flex flex-col items-center justify-center text-center space-y-8 animate-fade-in-up">
        
        <!-- Found But Not Downloaded -->
        <div v-if="flowState === 'found'" class="space-y-6">
           <div class="w-20 h-20 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(168,85,247,0.2)]">
              <Sparkles :size="32" class="text-purple-400" />
           </div>
           <div>
             <h3 class="text-sm font-black uppercase tracking-widest text-white">Transcript Found</h3>
             <p class="text-[10px] text-neutral-500 mt-2 max-w-[200px] mx-auto leading-relaxed">
                Archives for this artifact are ready. Download to enable real-time lyrics and oracle context.
             </p>
           </div>
           <button 
             @click="downloadTranscript" 
             class="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-full transition-all active:scale-95 shadow-lg flex items-center gap-3 mx-auto"
           >
             <DownloadCloud :size="14" />
             <span>Download to Device</span>
           </button>
        </div>

        <!-- Scanning / Downloading -->
        <div v-else-if="flowState === 'scanning' || flowState === 'downloading'" class="space-y-4">
           <Loader2 :size="32" class="text-purple-500 animate-spin mx-auto" />
           <p class="text-[9px] font-black uppercase tracking-widest text-neutral-500">
             {{ flowState === 'scanning' ? 'Searching Archives...' : 'Storing Locally...' }}
           </p>
        </div>

        <!-- Empty State -->
        <div v-else-if="flowState === 'empty'" class="space-y-6 opacity-60">
           <div class="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center mx-auto">
              <FileText :size="24" class="text-neutral-600" />
           </div>
           <p class="text-[10px] font-black uppercase tracking-widest text-neutral-500">No Transcript Detected</p>
           <button @click="scanServer" class="text-[9px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2 mx-auto">
              <RefreshCw :size="10" /> Re-Scan Frequency
           </button>
        </div>
      </div>

      <!-- THE TRANSCRIPT (Lyrics Style) -->
      <div v-else class="space-y-8 py-[40vh] flex flex-col items-center w-full">
        <div 
          v-for="(cue, index) in cues" 
          :key="index"
          @click="handleCueClick(cue)"
          class="cursor-pointer p-6 rounded-3xl w-full max-w-2xl transition-all duration-700 ease-out text-center"
          :class="[
            activeCueIndex === index 
              ? 'active-cue opacity-100 scale-105 bg-white/5 border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.1)]' 
              : 'opacity-30 scale-95 grayscale hover:opacity-60 border border-transparent'
          ]"
        >
          <!-- Metadata -->
          <div v-if="cue.speaker && activeCueIndex === index" class="mb-3 flex justify-center items-center gap-2">
             <span class="text-[8px] font-black uppercase tracking-widest text-purple-400 border border-purple-400/30 px-2 py-0.5 rounded-md">
               {{ cue.speaker }}
             </span>
          </div>

          <p 
            class="font-black leading-tight tracking-tight text-center transition-all"
            :class="[
               activeCueIndex === index ? 'text-white text-2xl md:text-3xl' : 'text-neutral-400 text-lg md:text-xl'
            ]"
          >
            {{ cue.text }}
          </p>

          <div v-if="cue.background_noise && activeCueIndex === index" class="mt-3 flex justify-center items-center gap-1.5 text-neutral-500">
             <Volume2 :size="10" />
             <span class="text-[8px] font-bold italic tracking-wider">{{ cue.background_noise }}</span>
          </div>
        </div>
      </div>

    </div>

    <!-- Fullscreen Mini Player Controls -->
    <div v-if="isFullscreen && flowState === 'ready'" class="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
       <div class="flex items-center gap-4 bg-black/60 backdrop-blur-xl border border-white/10 p-2 rounded-full shadow-2xl">
          <button @click="rewind" class="p-3 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/10 active:scale-95">
             <RotateCcw :size="20" />
          </button>
          
          <button 
            @click="togglePlay" 
            class="w-12 h-12 flex items-center justify-center bg-purple-600 text-white rounded-full shadow-[0_0_15px_rgba(168,85,247,0.5)] hover:scale-105 active:scale-95 transition-all"
          >
             <Pause v-if="playerState.isPlaying" :size="20" fill="currentColor" />
             <Play v-else :size="20" fill="currentColor" class="translate-x-0.5" />
          </button>

          <button @click="forward" class="p-3 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/10 active:scale-95">
             <RotateCw :size="20" />
          </button>
       </div>
    </div>

  </div>
</template>

<style scoped>
.purple-scrollbar::-webkit-scrollbar {
  width: 3px;
}
.purple-scrollbar::-webkit-scrollbar-thumb {
  background: #A855F7;
  border-radius: 10px;
}
.purple-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.active-cue {
  scroll-margin-block: 40vh;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.5s ease-out forwards;
}
</style>
