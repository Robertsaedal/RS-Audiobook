
<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import { TranscriptionService, TranscriptCue } from '../services/transcriptionService';
import { useTranscriptionQueue } from '../composables/useTranscriptionQueue';
import { ABSService } from '../services/absService';
import { ABSLibraryItem } from '../types';
import { Loader2, Sparkles, X, AlertTriangle, FileText, Clock, Volume2, RotateCcw } from 'lucide-vue-next';

const props = defineProps<{
  item: ABSLibraryItem,
  currentTime: number,
  absService: ABSService
}>();

const emit = defineEmits<{
  (e: 'close'): void,
  (e: 'seek', time: number): void
}>();

const { queue, addToQueue, cooldownTimer } = useTranscriptionQueue();

const cues = ref<TranscriptCue[]>([]);
const hasTranscript = ref(false);
const activeCueIndex = ref(-1);
const scrollContainer = ref<HTMLElement | null>(null);
const isLoadingLocal = ref(true);

/**
 * CRITICAL FIX: Find any queue item matching this book ID.
 * Previously used Math.floor(currentTime) which changed every second, 
 * causing the UI to "forget" it was processing.
 */
const queueItem = computed(() => queue.find(i => i.itemId === props.item.id));
const isQueued = computed(() => !!queueItem.value);
const queueStatus = computed(() => queueItem.value?.status);
const queueError = computed(() => queueItem.value?.error);

const progressLabel = computed(() => {
  if (cooldownTimer.value > 0 && queueStatus.value === 'retrying') {
    return `Rate Limit Reached. Retrying in ${cooldownTimer.value}s...`;
  }
  if (queueStatus.value === 'pending') return 'Waiting in Queue...';
  if (queueStatus.value === 'processing') return 'Transcribing Audio...';
  if (queueStatus.value === 'completed') return 'Finalizing...';
  if (queueStatus.value === 'failed') return 'Transcription Failed';
  return 'Initializing...';
});

const loadTranscript = async () => {
  isLoadingLocal.value = true;
  try {
    const content = await TranscriptionService.getTranscript(props.item.id);
    if (content) {
      const parsed = TranscriptionService.parseTranscript(content, 0);
      cues.value = parsed;
      hasTranscript.value = parsed.length > 0;
    } else {
      hasTranscript.value = false;
      cues.value = [];
    }
  } catch (e) {
    console.error("[TranscriptWindow] Failed to load local transcript", e);
    hasTranscript.value = false;
  } finally {
    isLoadingLocal.value = false;
  }
};

const handleGenerateClick = () => {
  const downloadUrl = props.absService.getDownloadUrl(props.item.id);
  const duration = props.item.media.duration;
  
  addToQueue(props.item.id, downloadUrl, duration, props.currentTime);
};

// Refresh UI when a queue item finishes for this specific book
watch(queueStatus, async (newStatus) => {
  if (newStatus === 'completed') {
    await loadTranscript();
  }
});

const handleCueClick = (cue: TranscriptCue) => {
  emit('seek', cue.start);
};

// Sync Active Cue with Player
watch(() => props.currentTime, (time) => {
  if (cues.value.length === 0) return;
  
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

onMounted(() => {
  loadTranscript();
});

watch(() => props.item.id, () => {
  loadTranscript();
});
</script>

<template>
  <div class="w-full h-full bg-[#0a0a0a]/60 backdrop-blur-2xl rounded-[32px] border border-white/10 flex flex-col overflow-hidden relative shadow-2xl">
    
    <!-- Header -->
    <div class="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
      <div class="flex items-center gap-2 px-2">
        <Sparkles :size="12" class="text-purple-500 shadow-aether-glow" />
        <span class="text-[9px] font-black uppercase tracking-widest text-white/50">Smart Transcribe</span>
      </div>
      <button @click="emit('close')" class="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white border border-white/5 tap-effect">
        <X :size="14" />
      </button>
    </div>

    <!-- Content Area -->
    <div ref="scrollContainer" class="flex-1 overflow-y-auto custom-scrollbar p-6 relative">
      
      <!-- Loading Local DB State -->
      <div v-if="isLoadingLocal && !isQueued" class="absolute inset-0 flex items-center justify-center">
         <Loader2 :size="24" class="text-purple-500 animate-spin" />
      </div>

      <!-- Processing State (Blocking Overlay) -->
      <div v-if="isQueued && queueStatus !== 'completed' && queueStatus !== 'failed'" class="absolute inset-0 flex flex-col items-center justify-center gap-6 z-20 bg-black/80 backdrop-blur-md">
        <div class="relative mb-2">
          <div class="absolute inset-0 bg-purple-500/20 blur-xl rounded-full animate-pulse" />
          <Loader2 v-if="queueStatus === 'processing'" :size="48" class="text-purple-500 animate-spin relative z-10" />
          <Clock v-else :size="48" class="text-neutral-500 animate-pulse relative z-10" />
        </div>
        
        <div class="flex flex-col items-center gap-3 w-64 text-center">
           <p class="text-[9px] font-black uppercase tracking-[0.3em] text-white animate-pulse">
             {{ progressLabel }}
           </p>
           
           <!-- Progress Bar -->
           <div class="w-full h-1 bg-white/10 rounded-full overflow-hidden">
               <div 
                  class="h-full transition-all duration-300 ease-out rounded-full"
                  :class="[
                    queueStatus === 'retrying' ? 'bg-amber-500' : 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]',
                    queueStatus === 'processing' ? 'animate-pulse' : ''
                  ]"
                  :style="{ width: queueStatus === 'processing' ? '60%' : '100%' }"
               ></div>
           </div>
        </div>
      </div>

      <!-- No Transcript / Queue Trigger State (Fixed logic to show on failure) -->
      <div v-if="!hasTranscript && (!isQueued || queueStatus === 'failed') && !isLoadingLocal" class="h-full flex flex-col items-center justify-center text-center space-y-6 px-4 animate-fade-in">
        <div class="w-16 h-16 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
           <FileText :size="24" class="text-neutral-500" />
        </div>
        <div class="space-y-1">
          <h3 class="text-sm font-black uppercase tracking-tight text-white">
            {{ queueStatus === 'failed' ? 'Transcription Interrupted' : 'No Transcript Available' }}
          </h3>
          <p class="text-[9px] text-neutral-500 leading-relaxed max-w-[200px] mx-auto">
            {{ queueStatus === 'failed' ? 'The AI encounter an issue processing this segment.' : 'Generate AI-powered transcripts with speaker identification for this segment.' }}
          </p>
        </div>
        
        <!-- Queue Error Message -->
        <div v-if="queueError" class="w-full max-w-xs bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex flex-col items-center gap-2 text-red-400">
           <AlertTriangle :size="16" />
           <span class="text-[9px] font-bold uppercase tracking-widest text-center">{{ queueError }}</span>
        </div>

        <button 
          @click="handleGenerateClick"
          class="px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-full shadow-[0_10px_30px_rgba(168,85,247,0.3)] transition-all active:scale-95 flex items-center gap-3 tap-effect"
        >
          <template v-if="queueStatus === 'failed'">
            <RotateCcw :size="14" />
            <span>Retry Generation</span>
          </template>
          <template v-else>
            <Sparkles :size="14" />
            <span>Generate Segment</span>
          </template>
        </button>
      </div>

      <!-- Transcript Lines -->
      <div v-if="hasTranscript" class="space-y-6 py-20 flex flex-col items-center min-h-full w-full">
        <div 
          v-for="(cue, index) in cues" 
          :key="index"
          @click="handleCueClick(cue)"
          class="cursor-pointer transition-all duration-500 p-5 rounded-[24px] border border-transparent hover:bg-white/5 w-full max-w-lg flex flex-col gap-2 group tap-effect"
          :class="activeCueIndex === index ? 'active-cue bg-white/5 border-purple-500/20 scale-105 shadow-xl' : 'opacity-40 hover:opacity-100 blur-[1px] hover:blur-none'"
        >
          <!-- Metadata Header -->
          <div class="flex items-center gap-3">
             <!-- Speaker Pill -->
             <span 
               v-if="cue.speaker"
               class="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all"
               :class="activeCueIndex === index ? 'text-purple-300 border-purple-500/40 bg-purple-500/10 shadow-[0_0_10px_rgba(168,85,247,0.2)]' : 'text-neutral-500 border-white/5 bg-black/20'"
             >
               {{ cue.speaker }}
             </span>
             
             <!-- Noise/Effect Indicator -->
             <div v-if="cue.background_noise" class="flex items-center gap-2 text-neutral-500">
               <Volume2 :size="10" class="text-purple-500/40" />
               <span class="text-[9px] italic font-medium text-neutral-600">{{ cue.background_noise }}</span>
             </div>
          </div>

          <!-- The Text Content -->
          <p 
            v-if="cue.text"
            class="text-base md:text-lg font-bold leading-relaxed transition-all duration-500"
            :class="activeCueIndex === index ? 'text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'text-neutral-400'"
          >
            {{ cue.text }}
          </p>
        </div>
        
        <!-- Bottom Spacer -->
        <div class="h-40 shrink-0 flex flex-col items-center gap-4 opacity-10">
          <div class="h-10 w-px bg-gradient-to-b from-white to-transparent"></div>
          <span class="text-[8px] font-black uppercase tracking-[0.5em]">End of Transcript</span>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fade-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.shadow-aether-glow {
  filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.8));
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(168, 85, 247, 0.1);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(168, 85, 247, 0.3);
}
</style>
