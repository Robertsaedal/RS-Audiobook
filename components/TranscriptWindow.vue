
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

// Smoother Transition State
const offsetTop = ref(0);

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
  if (cue && typeof cue.start === 'number') seek(cue.start);
};

const togglePlay = () => playerState.isPlaying ? pause() : play();
const rewind = () => seek(playerState.currentTime - 10);
const forward = () => seek(playerState.currentTime + 30);

// 🔥 SMOOTH SYNC LOGIC: CSS Transform-based Centering
watch(() => props.currentTime, (time) => {
  if (cues.value.length === 0 || isUserScrolling.value) return;
  
  const idx = cues.value.findIndex(c => time >= c.start && time <= c.end);
  if (idx !== -1 && idx !== activeCueIndex.value) {
      activeCueIndex.value = idx;
      syncScrollPosition();
  }
});

const syncScrollPosition = () => {
  nextTick(() => {
    if (!scrollContainer.value) return;
    const activeEl = scrollContainer.value.querySelector('.active-cue') as HTMLElement;
    if (activeEl) {
      // Logic: Move the container so the active element is always at the visual center
      const containerHeight = scrollContainer.value.offsetHeight;
      const targetPos = activeEl.offsetTop - (containerHeight / 2) + (activeEl.offsetHeight / 2);
      
      // We use native scroll for general support, but ensure it's throttled and smooth
      scrollContainer.value.scrollTo({
        top: targetPos,
        behavior: 'smooth'
      });
    }
  });
};

const onScroll = () => {
  if (userScrollTimeout) {
    isUserScrolling.value = true;
    clearTimeout(userScrollTimeout);
  }
  userScrollTimeout = setTimeout(() => isUserScrolling.value = false, 4000); 
};

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
  setTimeout(syncScrollPosition, 350);
};

onMounted(() => {
  initialCheck();
  userScrollTimeout = setTimeout(() => {}, 0);
});

onUnmounted(() => { if (userScrollTimeout) clearTimeout(userScrollTimeout); });
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
        <button @click="toggleFullscreen" class="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white border border-white/5">
          <Minimize2 v-if="isFullscreen" :size="16" />
          <Maximize2 v-else :size="16" />
        </button>
        <button @click="emit('close')" class="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white border border-white/5">
          <X :size="16" />
        </button>
      </div>
    </div>

    <!-- Main Content Area with Focus Mask -->
    <div 
      ref="scrollContainer" 
      @scroll="onScroll"
      class="flex-1 overflow-y-auto purple-scrollbar p-6 relative w-full focus-mask"
    >
      
      <div v-if="flowState !== 'ready'" class="h-full flex flex-col items-center justify-center text-center space-y-8 animate-fade-in-up">
        <div v-if="flowState === 'found'" class="space-y-6">
           <div class="w-20 h-20 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(168,85,247,0.2)]">
              <Sparkles :size="32" class="text-purple-400" />
           </div>
           <div>
             <h3 class="text-sm font-black uppercase tracking-widest text-white">Transcript Found</h3>
             <p class="text-[10px] text-neutral-500 mt-2 max-w-[200px] mx-auto leading-relaxed">Archives detected. Ready for local synchronization.</p>
           </div>
           <button @click="downloadTranscript" class="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-full transition-all active:scale-95 shadow-lg flex items-center gap-3 mx-auto">
             <DownloadCloud :size="14" />
             <span>Sync to Device</span>
           </button>
        </div>

        <div v-else-if="flowState === 'scanning' || flowState === 'downloading'" class="space-y-4">
           <Loader2 :size="32" class="text-purple-500 animate-spin mx-auto" />
           <p class="text-[9px] font-black uppercase tracking-[0.4em] text-neutral-500">{{ flowState === 'scanning' ? 'Querying Archives...' : 'Storing Artifact...' }}</p>
        </div>

        <div v-else-if="flowState === 'empty'" class="space-y-6 opacity-60">
           <div class="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center mx-auto"><FileText :size="24" class="text-neutral-600" /></div>
           <p class="text-[10px] font-black uppercase tracking-widest text-neutral-500">No Transcript Detected</p>
           <button @click="scanServer" class="text-[9px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2 mx-auto"><RefreshCw :size="10" /> Re-Scan</button>
        </div>
      </div>

      <!-- THE TRANSCRIPT (Smooth Logic) -->
      <div v-else class="space-y-8 py-[45vh] flex flex-col items-center w-full content-visibility-auto">
        <div 
          v-for="(cue, index) in cues" 
          :key="index"
          @click="handleCueClick(cue)"
          class="cursor-pointer p-6 rounded-[2rem] w-full max-w-2xl transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] text-center will-change-transform"
          :class="[
            activeCueIndex === index 
              ? 'active-cue opacity-100 scale-105 bg-white/5 border border-purple-500/30 shadow-[0_10px_40px_rgba(168,85,247,0.1)]' 
              : 'opacity-20 scale-95 grayscale hover:opacity-40 border border-transparent'
          ]"
        >
          <div v-if="cue.speaker && activeCueIndex === index" class="mb-3 flex justify-center items-center gap-2">
             <span class="text-[8px] font-black uppercase tracking-widest text-purple-400 border border-purple-400/30 px-2 py-0.5 rounded-md">{{ cue.speaker }}</span>
          </div>

          <p 
            class="font-black leading-tight tracking-tight text-center transition-all duration-700"
            :class="[ activeCueIndex === index ? 'text-white text-2xl md:text-4xl active-glow' : 'text-neutral-400 text-lg md:text-xl' ]"
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

    <!-- Mini Player for Fullscreen -->
    <div v-if="isFullscreen && flowState === 'ready'" class="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
       <div class="flex items-center gap-4 bg-black/80 backdrop-blur-2xl border border-white/10 p-3 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <button @click="rewind" class="p-3 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/5"><RotateCcw :size="20" /></button>
          <button @click="togglePlay" class="w-14 h-14 flex items-center justify-center bg-purple-600 text-white rounded-full shadow-glow hover:scale-105 transition-all">
             <Pause v-if="playerState.isPlaying" :size="24" fill="currentColor" />
             <Play v-else :size="24" fill="currentColor" class="translate-x-0.5" />
          </button>
          <button @click="forward" class="p-3 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/5"><RotateCw :size="20" /></button>
       </div>
    </div>

  </div>
</template>

<style scoped>
.purple-scrollbar::-webkit-scrollbar { width: 3px; }
.purple-scrollbar::-webkit-scrollbar-thumb { background: #A855F7; border-radius: 10px; }
.purple-scrollbar::-webkit-scrollbar-track { background: transparent; }

.focus-mask {
  mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%);
}

.content-visibility-auto {
  content-visibility: auto;
}

.active-cue {
  scroll-margin-block: 45vh;
}

.active-glow {
  text-shadow: 0 0 15px rgba(168, 85, 247, 0.3);
}

.shadow-glow {
  box-shadow: 0 0 25px rgba(168, 85, 247, 0.4);
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
</style>
