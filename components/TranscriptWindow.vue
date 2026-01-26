
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { TranscriptionService } from '../services/transcriptionService';
import { db, TranscriptCue } from '../services/db';
import { ABSLibraryItem } from '../types';
import { ABSService } from '../services/absService';
import { X, Volume2, FileText, Send, CheckCircle, AlertTriangle, Loader2, Upload, RefreshCw, AudioLines, DownloadCloud } from 'lucide-vue-next';
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

const cues = ref<TranscriptCue[]>([]);
const hasTranscript = ref(false);
const isLoading = ref(false);
const activeCueIndex = ref(-1);
const scrollContainer = ref<HTMLElement | null>(null);
const isUserScrolling = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
let userScrollTimeout: any = null;

// New State for Manual Flow
const flowState = ref<'idle' | 'scanning' | 'found' | 'downloading' | 'ready' | 'empty'>('idle');
const candidateFile = ref<{ url: string, name: string } | null>(null);

// Request State
const requestStatus = ref<'idle' | 'sending' | 'success' | 'error'>('idle');

// Check Local DB First
const initialCheck = async () => {
  isLoading.value = true;
  try {
    const record = await db.transcripts.get(props.item.id);
    if (record && record.cues && record.cues.length > 0) {
      cues.value = record.cues;
      hasTranscript.value = true;
      flowState.value = 'ready';
    } else {
      flowState.value = 'idle'; // Wait for user to scan
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
    } else {
      alert("Failed to parse transcript file.");
      flowState.value = 'found'; // Go back to found state
    }
  } catch (e) {
    flowState.value = 'found';
  }
};

const handleRequestTranscript = async (e: MouseEvent) => {
  if (requestStatus.value === 'sending') return;
  requestStatus.value = 'sending';

  const success = await TranscriptionService.requestTranscript(props.item);
  
  if (success) {
    requestStatus.value = 'success';
    
    // Confetti Effect
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    confetti({
      particleCount: 30,
      spread: 60,
      origin: { x: rect.left / window.innerWidth, y: rect.top / window.innerHeight },
      colors: ['#A855F7', '#FFFFFF'],
      scalar: 0.7
    });

  } else {
    requestStatus.value = 'error';
  }
};

const triggerUpload = () => {
  fileInput.value?.click();
};

const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const isVtt = file.name.endsWith('.vtt') || content.trim().startsWith('WEBVTT');
      
      let parsedCues: TranscriptCue[] = [];

      if (isVtt) {
         parsedCues = TranscriptionService.parseVTT(content);
      } else {
         const json = JSON.parse(content);
         parsedCues = TranscriptionService.parseJSON(json);
      }

      if (parsedCues.length > 0) {
         cues.value = parsedCues;
         hasTranscript.value = true;
         flowState.value = 'ready';
         // Optionally cache this manual upload too
         db.transcripts.put({ itemId: props.item.id, cues: parsedCues, createdAt: Date.now() });
      } else {
          alert("Invalid transcript format: Could not parse cues.");
      }
    } catch (err) {
      console.error("Invalid File", err);
      alert("Failed to parse file.");
    }
  };
  reader.readAsText(file);
};

const handleCueClick = (cue: TranscriptCue) => {
  if (cue && typeof cue.start === 'number') {
    emit('seek', cue.start);
  }
};

// Sync Active Cue
watch(() => props.currentTime, (time) => {
  if (cues.value.length === 0) return;
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
  }, 3500); 
};

const scrollToActive = () => {
  nextTick(() => {
    if (!scrollContainer.value) return;
    const activeEl = scrollContainer.value.querySelector('.active-cue');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
};

onMounted(() => {
  initialCheck();
});

watch(() => props.item.id, () => initialCheck());

onUnmounted(() => {
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
});
</script>

<template>
  <div class="w-full h-full bg-neutral-900/90 backdrop-blur-md rounded-[32px] border border-white/10 flex flex-col overflow-hidden relative shadow-2xl">
    
    <!-- Header -->
    <div class="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/90 to-transparent">
      <div class="flex items-center gap-2 px-2">
        <FileText :size="12" class="text-purple-500" />
        <span class="text-[9px] font-black uppercase tracking-widest text-white/50">Lyrics / Text</span>
      </div>
      <button @click="emit('close')" class="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white border border-white/5">
        <X :size="14" />
      </button>
    </div>

    <!-- Content Area with Focus Mask -->
    <div 
      ref="scrollContainer" 
      @scroll="onScroll"
      class="flex-1 overflow-y-auto custom-scrollbar p-6 relative focus-mask"
    >
      
      <!-- LOADING STATE -->
      <div v-if="isLoading" class="absolute inset-0 flex flex-col items-center justify-center gap-6 z-20">
        <Loader2 :size="32" class="text-purple-500 animate-spin" />
      </div>

      <!-- No Transcript / Request State -->
      <div v-else-if="!hasTranscript" class="h-full flex flex-col items-center justify-center text-center space-y-8 px-6">
        
        <!-- FOUND STATE (Manual Download) -->
        <div v-if="flowState === 'found'" class="animate-in fade-in zoom-in space-y-6">
           <div class="w-16 h-16 rounded-full bg-purple-500/20 border border-purple-500/50 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(168,85,247,0.3)] animate-pulse">
              <FileText :size="32" class="text-purple-400" />
           </div>
           <div>
             <h3 class="text-lg font-black uppercase tracking-tighter text-white">Transcript Found</h3>
             <p class="text-[10px] text-neutral-400 mt-2 max-w-[200px] mx-auto leading-relaxed">
                {{ candidateFile?.name }}<br>
                Tap below to download and process.
             </p>
           </div>
           <button 
             @click="downloadTranscript" 
             class="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-full transition-all active:scale-95 shadow-lg flex items-center gap-3 mx-auto"
           >
             <DownloadCloud :size="14" />
             <span>Download & Sync</span>
           </button>
        </div>

        <!-- SCANNING STATE -->
        <div v-else-if="flowState === 'scanning' || flowState === 'downloading'" class="space-y-4">
           <Loader2 :size="32" class="text-purple-500 animate-spin mx-auto" />
           <p class="text-[10px] font-black uppercase tracking-widest text-neutral-500">
             {{ flowState === 'scanning' ? 'Scanning Server Archives...' : 'Downloading & Processing...' }}
           </p>
        </div>

        <!-- EMPTY / IDLE STATE -->
        <div v-else class="space-y-8">
            <!-- Ghost Visualizer -->
            <div class="relative w-24 h-16 flex items-center justify-center gap-1 opacity-50 mx-auto">
              <div class="w-1.5 h-6 bg-purple-500 rounded-full animate-wave" style="animation-delay: 0.1s"></div>
              <div class="w-1.5 h-10 bg-purple-400 rounded-full animate-wave" style="animation-delay: 0.2s"></div>
              <div class="w-1.5 h-8 bg-purple-600 rounded-full animate-wave" style="animation-delay: 0.3s"></div>
              <div class="w-1.5 h-12 bg-purple-500 rounded-full animate-wave" style="animation-delay: 0.4s"></div>
              <div class="w-1.5 h-5 bg-purple-400 rounded-full animate-wave" style="animation-delay: 0.5s"></div>
              <div class="absolute inset-0 blur-xl bg-purple-500/20"></div>
            </div>
            
            <div class="space-y-2">
              <h3 class="text-sm font-black uppercase tracking-tight text-white">
                {{ flowState === 'empty' ? 'No Files Found' : 'Transcript System' }}
              </h3>
              <p class="text-[10px] text-neutral-500 leading-relaxed max-w-[220px] mx-auto">
                {{ flowState === 'empty' ? 'No matching subtitle files located in the archive index.' : 'Local cache empty. Check server for files?' }}
              </p>
            </div>
            
            <!-- Actions -->
            <div class="pt-4 flex flex-col items-center gap-4 w-full">
                <button 
                    @click="scanServer"
                    class="px-6 py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-neutral-300 font-black uppercase tracking-[0.15em] text-[9px] rounded-full transition-all active:scale-95 flex items-center gap-2"
                  >
                    <RefreshCw :size="12" />
                    <span>Check Server</span>
                </button>

                <div>
                  <button 
                    v-if="requestStatus === 'idle' || requestStatus === 'error'"
                    @click="handleRequestTranscript"
                    class="px-6 py-3 bg-neutral-800 hover:bg-purple-900/40 border border-white/10 hover:border-purple-500/30 text-white font-black uppercase tracking-[0.15em] text-[9px] rounded-full transition-all active:scale-95 flex items-center gap-2 group"
                  >
                    <Send :size="12" class="group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
                    <span>Request Transcript</span>
                  </button>
                  
                  <button 
                    v-else-if="requestStatus === 'sending'"
                    disabled
                    class="px-6 py-3 bg-neutral-900 border border-white/5 text-neutral-500 font-black uppercase tracking-[0.15em] text-[9px] rounded-full flex items-center gap-2 cursor-wait"
                  >
                    <Loader2 :size="12" class="animate-spin" />
                    <span>Transmitting...</span>
                  </button>

                  <div v-else-if="requestStatus === 'success'" class="flex flex-col items-center gap-2 animate-in fade-in zoom-in">
                    <div class="px-6 py-3 bg-green-500/10 border border-green-500/20 text-green-400 font-black uppercase tracking-[0.15em] text-[9px] rounded-full flex items-center gap-2">
                      <CheckCircle :size="12" />
                      <span>Request Sent</span>
                    </div>
                  </div>
                </div>

                <!-- Manual Upload Section -->
                <div class="pt-6 w-full max-w-[200px] flex flex-col items-center gap-2 opacity-40 hover:opacity-100 transition-opacity">
                  <input ref="fileInput" type="file" accept=".json,.jason,.vtt" class="hidden" @change="handleFileUpload" />
                  <button 
                    @click="triggerUpload"
                    class="text-[8px] font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors flex items-center gap-2 py-2"
                  >
                    <Upload :size="10" />
                    <span>Manual Upload</span>
                  </button>
                </div>
            </div>
        </div>
      </div>

      <!-- Transcript Lines -->
      <div v-else class="space-y-6 py-[50vh] flex flex-col items-center min-h-full justify-start w-full content-visibility-auto">
        <div 
          v-for="(cue, index) in cues" 
          :key="index"
          @click="handleCueClick(cue)"
          class="cursor-pointer p-6 rounded-3xl w-full max-w-lg flex flex-col gap-3 group relative cinema-transition cue-item will-change-transform"
          :class="[
            activeCueIndex === index 
              ? 'active-cue opacity-100 scale-100 z-10 bg-white/5 border border-purple-500/30' 
              : 'opacity-20 scale-95 border border-transparent hover:opacity-40 grayscale'
          ]"
        >
          <!-- Metadata Header (Hidden unless active) -->
          <div 
            class="flex items-center gap-3 transition-opacity duration-700"
            :class="activeCueIndex === index ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'"
          >
             <span 
               v-if="cue.speaker"
               class="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border text-purple-300 border-purple-500/30 bg-purple-500/10"
             >
               {{ cue.speaker }}
             </span>
             <div v-if="cue.background_noise" class="flex items-center gap-1.5 text-neutral-500">
               <Volume2 :size="10" />
               <span class="text-[8px] italic text-neutral-600">{{ cue.background_noise }}</span>
             </div>
          </div>

          <!-- Text -->
          <p 
            class="text-xl md:text-2xl font-bold leading-relaxed transition-all duration-700"
            :class="activeCueIndex === index ? 'text-white active-glow' : 'text-neutral-400'"
          >
            {{ cue.text }}
          </p>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.focus-mask {
  mask-image: linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%);
}

.content-visibility-auto {
  content-visibility: auto;
}

.cue-item {
  scroll-margin-block: 50vh;
}

.cinema-transition {
  transition: all 0.7s cubic-bezier(0.2, 0, 0.2, 1);
}

.will-change-transform {
  will-change: transform, opacity;
}

.active-glow {
  text-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
}

@keyframes wave {
  0%, 100% { height: 10px; opacity: 0.5; }
  50% { height: 30px; opacity: 1; }
}

.animate-wave {
  animation: wave 1.2s ease-in-out infinite;
}
</style>
