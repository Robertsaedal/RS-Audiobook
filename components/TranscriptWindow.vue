
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { TranscriptionService } from '../services/transcriptionService';
import { TranscriptCue } from '../services/db';
import { ABSLibraryItem } from '../types';
import { ABSService } from '../services/absService';
import { X, Volume2, FileText, Send, CheckCircle, AlertTriangle, Loader2, Upload, RefreshCw, AudioLines } from 'lucide-vue-next';
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
const isLoading = ref(true);
const isRetrying = ref(false);
const activeCueIndex = ref(-1);
const scrollContainer = ref<HTMLElement | null>(null);
const isUserScrolling = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
let userScrollTimeout: any = null;

// Request State
const requestStatus = ref<'idle' | 'sending' | 'success' | 'error'>('idle');

const loadTranscript = async (forceRefresh = false) => {
  if (forceRefresh) isRetrying.value = true;
  else isLoading.value = true;
  
  requestStatus.value = 'idle';
  
  try {
    const result = await TranscriptionService.getTranscript(props.item.id, props.absService || null, forceRefresh);
    if (result && result.length > 0) {
      cues.value = result;
      hasTranscript.value = true;
    } else {
      cues.value = [];
      hasTranscript.value = false;
    }
  } catch (e) {
    console.error("Failed to load transcript", e);
    hasTranscript.value = false;
  } finally {
    isLoading.value = false;
    isRetrying.value = false;
  }
};

const handleRetryScan = () => {
  loadTranscript(true);
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
  }, 3500); // Increased timeout to prevent fighting
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
  loadTranscript();
});

watch(() => props.item.id, () => loadTranscript(false));

onUnmounted(() => {
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
});
</script>

<template>
  <div class="w-full h-full bg-black/40 backdrop-blur-xl rounded-[32px] border border-white/10 flex flex-col overflow-hidden relative shadow-2xl">
    
    <!-- Header -->
    <div class="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
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
        <!-- Ghost Visualizer -->
        <div class="relative w-24 h-16 flex items-center justify-center gap-1 opacity-50">
           <div class="w-1.5 h-6 bg-purple-500 rounded-full animate-wave" style="animation-delay: 0.1s"></div>
           <div class="w-1.5 h-10 bg-purple-400 rounded-full animate-wave" style="animation-delay: 0.2s"></div>
           <div class="w-1.5 h-8 bg-purple-600 rounded-full animate-wave" style="animation-delay: 0.3s"></div>
           <div class="w-1.5 h-12 bg-purple-500 rounded-full animate-wave" style="animation-delay: 0.4s"></div>
           <div class="w-1.5 h-5 bg-purple-400 rounded-full animate-wave" style="animation-delay: 0.5s"></div>
           <div class="absolute inset-0 blur-xl bg-purple-500/20"></div>
        </div>
        
        <div class="space-y-2">
          <h3 class="text-sm font-black uppercase tracking-tight text-white">Signal Lost</h3>
          <p class="text-[10px] text-neutral-500 leading-relaxed max-w-[220px] mx-auto">
            No synchronized data stream located in the archive index.
          </p>
        </div>
        
        <!-- Actions -->
        <div class="pt-4 flex flex-col items-center gap-4 w-full">
            <button 
                @click="handleRetryScan"
                :disabled="isRetrying"
                class="px-6 py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-neutral-300 font-black uppercase tracking-[0.15em] text-[9px] rounded-full transition-all active:scale-95 flex items-center gap-2"
              >
                <RefreshCw :size="12" :class="{ 'animate-spin': isRetrying }" />
                <span>{{ isRetrying ? 'Scanning...' : 'Scan for Files' }}</span>
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

      <!-- Transcript Lines -->
      <div v-else class="space-y-8 py-32 flex flex-col items-center min-h-full justify-start w-full">
        <div 
          v-for="(cue, index) in cues" 
          :key="index"
          @click="handleCueClick(cue)"
          class="cursor-pointer p-6 rounded-3xl w-full max-w-lg flex flex-col gap-2 group relative transition-all duration-500 cue-item"
          :class="[
            activeCueIndex === index 
              ? 'active-cue bg-white/5 border border-purple-500/50 scale-105 shadow-[0_0_30px_rgba(168,85,247,0.2)] z-10' 
              : 'opacity-40 hover:opacity-80 scale-100 border border-transparent'
          ]"
        >
          <!-- Metadata Header -->
          <div class="flex items-center gap-3">
             <span 
               v-if="cue.speaker"
               class="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border transition-colors duration-300"
               :class="activeCueIndex === index ? 'text-purple-300 border-purple-500/30 bg-purple-500/10' : 'text-neutral-500 border-white/5 bg-black/20'"
             >
               {{ cue.speaker }}
             </span>
             <div v-if="cue.background_noise" class="flex items-center gap-1.5 text-neutral-500">
               <Volume2 :size="10" />
               <span class="text-[8px] italic text-neutral-600">{{ cue.background_noise }}</span>
             </div>
          </div>

          <!-- Karaoke Text -->
          <p 
            class="text-lg md:text-xl font-bold leading-relaxed transition-colors duration-500 relative inline-block decoration-clone"
            :class="activeCueIndex === index ? 'text-purple-100 karaoke-text' : 'text-neutral-300'"
            :style="activeCueIndex === index ? { '--anim-duration': Math.max(0.5, cue.end - cue.start) + 's' } : {}"
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
  mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
}

.cue-item {
  scroll-margin-top: 150px;
  scroll-margin-bottom: 150px;
  will-change: transform, opacity;
  transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1); /* Spring-like ease */
}

.decoration-clone {
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.karaoke-text {
  background: linear-gradient(to right, #ffffff 50%, #737373 50%);
  background-size: 200% 100%;
  background-position: 100% 0;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: fillText var(--anim-duration) linear forwards;
  will-change: background-position;
}

@keyframes fillText {
  to {
    background-position: 0 0;
  }
}

@keyframes wave {
  0%, 100% { height: 10px; opacity: 0.5; }
  50% { height: 30px; opacity: 1; }
}

.animate-wave {
  animation: wave 1.2s ease-in-out infinite;
}
</style>
