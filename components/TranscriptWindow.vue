
<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick, onUnmounted } from 'vue';
import { TranscriptionService, TranscriptCue } from '../services/transcriptionService';
import { useTranscriptionQueue } from '../composables/useTranscriptionQueue';
import { ABSService } from '../services/absService';
import { ABSLibraryItem } from '../types';
import { Loader2, Sparkles, X, AlertTriangle, FileText, CheckCircle, Clock, Volume2 } from 'lucide-vue-next';

const props = defineProps<{
  item: ABSLibraryItem,
  currentTime: number,
  absService: ABSService
}>();

const emit = defineEmits<{
  (e: 'close'): void,
  (e: 'seek', time: number): void
}>();

const { getItemStatus, addToQueue, cooldownTimer } = useTranscriptionQueue();

const cues = ref<TranscriptCue[]>([]);
const hasTranscript = ref(false);
const activeCueIndex = ref(-1);
const scrollContainer = ref<HTMLElement | null>(null);

// Queue Status tracking
const queueItem = computed(() => getItemStatus(props.item.id, props.currentTime));
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

const activeCue = computed(() => activeCueIndex.value !== -1 ? cues.value[activeCueIndex.value] : null);

const loadTranscript = async () => {
  const content = await TranscriptionService.getTranscript(props.item.id);
  if (content) {
    cues.value = TranscriptionService.parseTranscript(content, 0);
    hasTranscript.value = cues.value.length > 0;
  } else {
    hasTranscript.value = false;
    cues.value = [];
  }
};

const handleGenerateClick = () => {
  const downloadUrl = props.absService.getDownloadUrl(props.item.id);
  const duration = props.item.media.duration;
  
  addToQueue(props.item.id, downloadUrl, duration, props.currentTime);
};

watch(queueStatus, (newStatus) => {
  if (newStatus === 'completed') {
    loadTranscript();
  }
});

const handleCueClick = (cue: TranscriptCue) => {
  emit('seek', cue.start);
};

// Sync Active Cue
watch(() => props.currentTime, (time) => {
  if (cues.value.length === 0) return;
  
  if (activeCueIndex.value !== -1) {
    const current = cues.value[activeCueIndex.value];
    if (time >= current.start && time <= current.end) return; 
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

onMounted(() => {
  loadTranscript();
});

watch(() => props.item.id, loadTranscript);
</script>

<template>
  <div class="w-full h-full bg-black/40 backdrop-blur-xl rounded-[32px] border border-white/10 flex flex-col overflow-hidden relative shadow-2xl">
    
    <!-- Header -->
    <div class="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
      <div class="flex items-center gap-2 px-2">
        <Sparkles :size="12" class="text-purple-500" />
        <span class="text-[9px] font-black uppercase tracking-widest text-white/50">Smart Transcribe</span>
      </div>
      <button @click="emit('close')" class="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white border border-white/5">
        <X :size="14" />
      </button>
    </div>

    <!-- Content Area -->
    <div ref="scrollContainer" class="flex-1 overflow-y-auto custom-scrollbar p-6 relative">
      
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

      <!-- No Transcript / Queue Trigger State -->
      <div v-if="!hasTranscript && !isQueued" class="h-full flex flex-col items-center justify-center text-center space-y-6 px-4">
        <div class="w-16 h-16 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
           <FileText :size="24" class="text-neutral-500" />
        </div>
        <div class="space-y-1">
          <h3 class="text-sm font-black uppercase tracking-tight text-white">No Transcript</h3>
          <p class="text-[9px] text-neutral-500 leading-relaxed max-w-[200px] mx-auto">
            Generate AI-powered transcripts with speaker identification for this segment.
          </p>
        </div>
        
        <!-- Queue Error Message -->
        <div v-if="queueError" class="w-full bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-center gap-2 text-red-400 justify-center">
           <AlertTriangle :size="12" />
           <span class="text-[8px] font-bold uppercase">{{ queueError }}</span>
        </div>

        <button 
          @click="handleGenerateClick"
          class="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-[0.15em] text-[9px] rounded-full shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all active:scale-95 flex items-center gap-2"
        >
          <Sparkles :size="12" />
          <span>Generate Segment</span>
        </button>
      </div>

      <!-- Transcript Lines -->
      <div v-if="hasTranscript" class="space-y-6 py-20 flex flex-col items-center min-h-full justify-center w-full">
        <div 
          v-for="(cue, index) in cues" 
          :key="index"
          @click="handleCueClick(cue)"
          class="cursor-pointer transition-all duration-500 p-4 rounded-2xl border border-transparent hover:bg-white/5 w-full max-w-lg flex flex-col gap-2 group"
          :class="activeCueIndex === index ? 'active-cue bg-white/5 border-purple-500/20 scale-105 shadow-lg' : 'opacity-50 hover:opacity-90 blur-[1px] hover:blur-none'"
        >
          <!-- Metadata Header -->
          <div class="flex items-center gap-3">
             <!-- Speaker -->
             <span 
               v-if="cue.speaker"
               class="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border"
               :class="activeCueIndex === index ? 'text-purple-300 border-purple-500/30 bg-purple-500/10' : 'text-neutral-500 border-white/5 bg-black/20'"
             >
               {{ cue.speaker }}
             </span>
             
             <!-- Background Noise Indicator -->
             <div v-if="cue.background_noise" class="flex items-center gap-1.5 text-neutral-500">
               <Volume2 :size="10" />
               <span class="text-[8px] italic text-neutral-600">{{ cue.background_noise }}</span>
             </div>
          </div>

          <p 
            v-if="cue.text"
            class="text-base md:text-lg font-bold leading-relaxed transition-colors duration-300"
            :class="activeCueIndex === index ? 'text-purple-100 drop-shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'text-neutral-300'"
          >
            {{ cue.text }}
          </p>
        </div>
      </div>

    </div>
  </div>
</template>
