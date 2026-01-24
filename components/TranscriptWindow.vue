
<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import { TranscriptionService, VttCue } from '../services/transcriptionService';
import { ABSService } from '../services/absService';
import { ABSLibraryItem } from '../types';
import { Loader2, Sparkles, X, AlertTriangle, FileText } from 'lucide-vue-next';

const props = defineProps<{
  item: ABSLibraryItem,
  currentTime: number,
  absService: ABSService
}>();

const emit = defineEmits<{
  (e: 'close'): void,
  (e: 'seek', time: number): void
}>();

const cues = ref<VttCue[]>([]);
const isLoading = ref(false);
const errorMsg = ref<string | null>(null);
const hasTranscript = ref(false);
const activeCueIndex = ref(-1);
const scrollContainer = ref<HTMLElement | null>(null);

// Progress State
const processingProgress = ref(0);
let progressInterval: any = null;

const activeCue = computed(() => activeCueIndex.value !== -1 ? cues.value[activeCueIndex.value] : null);

const progressLabel = computed(() => {
  if (processingProgress.value < 20) return 'Initializing Gemini...';
  if (processingProgress.value < 80) return 'Connecting to Stream...';
  return 'Streaming Text...';
});

const startProgressSimulation = () => {
  processingProgress.value = 0;
  if (progressInterval) clearInterval(progressInterval);
  
  progressInterval = setInterval(() => {
    if (processingProgress.value < 20) {
       processingProgress.value += 2; // Fast start
    } else if (processingProgress.value < 80) {
       processingProgress.value += 0.5; // Steady processing
    } else if (processingProgress.value < 95) {
       processingProgress.value += 0.1; // Slow finish
    }
  }, 100);
};

const stopProgressSimulation = () => {
  if (progressInterval) clearInterval(progressInterval);
  processingProgress.value = 100;
};

const loadTranscript = async () => {
  errorMsg.value = null;
  const vtt = await TranscriptionService.getTranscript(props.item.id);
  if (vtt) {
    cues.value = TranscriptionService.parseVTT(vtt);
    hasTranscript.value = true;
  } else {
    hasTranscript.value = false;
    cues.value = [];
  }
};

const generateTranscript = async () => {
  isLoading.value = true;
  errorMsg.value = null;
  cues.value = [];
  startProgressSimulation();

  let accumulatedVtt = '';
  let hasStoppedLoading = false;

  try {
    const downloadUrl = props.absService.getDownloadUrl(props.item.id);
    const duration = props.item.media.duration;
    
    // Pass duration and streaming callback to service
    const vtt = await TranscriptionService.generateTranscript(
      props.item.id, 
      downloadUrl, 
      duration,
      (chunk) => {
        accumulatedVtt += chunk;
        
        // Once we get any data, remove the full screen loading state so user sees text streaming
        if (!hasStoppedLoading && accumulatedVtt.length > 20) {
           stopProgressSimulation();
           isLoading.value = false; 
           hasTranscript.value = true;
           hasStoppedLoading = true;
        }

        // Parse whatever we have so far
        // Note: This might parse incomplete lines at the end, but the next chunk will fix it.
        cues.value = TranscriptionService.parseVTT(accumulatedVtt);
      }
    );
    
    // Final parse to ensure everything is correct
    cues.value = TranscriptionService.parseVTT(vtt);
    hasTranscript.value = true;

  } catch (e: any) {
    console.error("Transcription Failed", e);
    errorMsg.value = e.message || "Gemini connection failed.";
    hasTranscript.value = false;
  } finally {
    stopProgressSimulation();
    isLoading.value = false;
  }
};

const handleCueClick = (cue: VttCue) => {
  emit('seek', cue.start);
};

// Sync Active Cue
watch(() => props.currentTime, (time) => {
  if (cues.value.length === 0) return;
  
  // Optimized find active cue
  // Check if current active is still valid to avoid full search
  if (activeCueIndex.value !== -1) {
    const current = cues.value[activeCueIndex.value];
    if (time >= current.start && time <= current.end) return; // Still active
  }

  const idx = cues.value.findIndex(c => time >= c.start && time <= c.end);
  if (idx !== -1 && idx !== activeCueIndex.value) {
    activeCueIndex.value = idx;
    scrollToActive();
  }
});

const scrollToActive = () => {
  nextTick(() => {
    if (!scrollContainer.value) return;
    const activeEl = scrollContainer.value.querySelector('.active-cue');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
};

watch(() => props.item.id, loadTranscript, { immediate: true });
</script>

<template>
  <div class="w-full h-full bg-black/40 backdrop-blur-xl rounded-[32px] border border-white/10 flex flex-col overflow-hidden relative shadow-2xl">
    
    <!-- Header -->
    <div class="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
      <div class="flex items-center gap-2 px-2">
        <Sparkles :size="12" class="text-purple-500" />
        <span class="text-[9px] font-black uppercase tracking-widest text-white/50">Lyrics / Text</span>
      </div>
      <button @click="emit('close')" class="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white border border-white/5">
        <X :size="14" />
      </button>
    </div>

    <!-- Content Area -->
    <div ref="scrollContainer" class="flex-1 overflow-y-auto custom-scrollbar p-6 relative">
      
      <!-- Loading State (Blocking Overlay) -->
      <div v-if="isLoading" class="absolute inset-0 flex flex-col items-center justify-center gap-6 z-20 bg-black/80 backdrop-blur-md">
        <div class="relative mb-2">
          <div class="absolute inset-0 bg-purple-500/20 blur-xl rounded-full animate-pulse" />
          <Loader2 :size="48" class="text-purple-500 animate-spin relative z-10" />
        </div>
        
        <div class="flex flex-col items-center gap-3 w-64">
           <p class="text-[9px] font-black uppercase tracking-[0.3em] text-white animate-pulse">Processing Audio...</p>
           
           <!-- High Fidelity Progress Bar -->
           <div class="w-full h-1 bg-white/10 rounded-full overflow-hidden">
               <div 
                  class="h-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)] transition-all duration-300 ease-out rounded-full"
                  :style="{ width: `${processingProgress}%` }"
               ></div>
           </div>

           <!-- Dynamic Status Label -->
           <p class="text-[8px] font-bold uppercase tracking-widest text-neutral-500 transition-all duration-300">
               {{ progressLabel }}
           </p>
        </div>
      </div>

      <!-- No Transcript State -->
      <div v-if="!hasTranscript && !isLoading" class="h-full flex flex-col items-center justify-center text-center space-y-6 px-4">
        <div class="w-16 h-16 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
           <FileText :size="24" class="text-neutral-500" />
        </div>
        <div class="space-y-1">
          <h3 class="text-sm font-black uppercase tracking-tight text-white">No Transcript</h3>
          <p class="text-[9px] text-neutral-500 leading-relaxed max-w-[200px] mx-auto">
            Use Gemini to generate synchronized subtitles for this track.
          </p>
        </div>
        
        <div v-if="errorMsg" class="w-full bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-center gap-2 text-red-400 justify-center">
           <AlertTriangle :size="12" />
           <span class="text-[8px] font-bold uppercase">{{ errorMsg }}</span>
        </div>

        <button 
          @click="generateTranscript"
          class="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-[0.15em] text-[9px] rounded-full shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all active:scale-95 flex items-center gap-2"
        >
          <Sparkles :size="12" />
          <span>Generate</span>
        </button>
      </div>

      <!-- Transcript Lines (Visible while streaming) -->
      <div v-if="hasTranscript" class="space-y-4 py-20 flex flex-col items-center min-h-full justify-center">
        <!-- Live Generation Indicator at bottom if actively accumulating and less than full -->
        <div v-if="cues.length === 0" class="flex flex-col items-center gap-2 animate-pulse text-purple-400">
           <Sparkles :size="16" />
           <span class="text-[8px] font-black uppercase tracking-widest">Generating Text...</span>
        </div>

        <div 
          v-for="(cue, index) in cues" 
          :key="index"
          @click="handleCueClick(cue)"
          class="cursor-pointer transition-all duration-500 py-3 px-4 rounded-2xl border border-transparent hover:bg-white/5 w-full text-center max-w-lg"
          :class="activeCueIndex === index ? 'active-cue bg-white/5 border-purple-500/20 scale-105 shadow-lg' : 'opacity-40 hover:opacity-80 scale-95 blur-[0.5px] hover:blur-0'"
        >
          <p 
            class="text-base md:text-lg font-bold leading-relaxed transition-colors duration-300"
            :class="activeCueIndex === index ? 'text-purple-200 drop-shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'text-neutral-300'"
          >
            {{ cue.text }}
          </p>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* Ensure smooth transitions for opacity and blur */
.blur-[0.5px] {
  filter: blur(0.5px);
}
.hover\:blur-0:hover {
  filter: blur(0);
}
</style>
