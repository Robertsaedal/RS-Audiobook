
<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick, onUnmounted } from 'vue';
import { TranscriptionService } from '../services/transcriptionService';
import { TranscriptCue } from '../services/db';
import { useTranscriptionQueue } from '../composables/useTranscriptionQueue';
import { ABSService } from '../services/absService';
import { ABSLibraryItem } from '../types';
import { Loader2, Sparkles, X, AlertTriangle, FileText, Clock, Volume2, RotateCcw, RefreshCw, PlayCircle } from 'lucide-vue-next';

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
const isUserScrolling = ref(false);
let userScrollTimeout: any = null;

// Track the specific timestamp we requested last, so we don't lose the error state if user scrubs away
const lastRequestedTime = ref<number | null>(null);

// Queue Status tracking
const queueItem = computed(() => {
  // Check active request OR specific point in time
  return getItemStatus(props.item.id, lastRequestedTime.value !== null ? lastRequestedTime.value : props.currentTime);
});

const isQueued = computed(() => !!queueItem.value);
const queueStatus = computed(() => queueItem.value?.status);
const queueError = computed(() => queueItem.value?.error);

const progressLabel = computed(() => {
  if (cooldownTimer.value > 0 && queueStatus.value === 'retrying') {
    return `Rate Limit. Retry in ${cooldownTimer.value}s`;
  }
  if (queueStatus.value === 'pending') return 'Queued';
  if (queueStatus.value === 'processing') return 'Transcribing...';
  if (queueStatus.value === 'completed') return 'Done';
  if (queueStatus.value === 'failed') return 'Failed';
  return 'Initializing...';
});

// Check if we are completely lost (e.g. jumped to 1 hour but transcript is only 0-5 mins)
const isOutOfSync = computed(() => {
  if (!hasTranscript.value || cues.value.length === 0) return false;
  const first = cues.value[0];
  const last = cues.value[cues.value.length - 1];
  return props.currentTime > (last.end + 10);
});

const loadTranscript = async () => {
  const result = await TranscriptionService.getTranscript(props.item.id);
  if (result && result.length > 0) {
    cues.value = result;
    hasTranscript.value = true;
  } else {
    if (cues.value.length === 0) {
      hasTranscript.value = false;
    }
  }
};

const deleteTranscript = async () => {
  if (confirm('Delete this transcript? You can regenerate it afterwards.')) {
    await TranscriptionService.deleteTranscript(props.item.id);
    hasTranscript.value = false;
    cues.value = [];
  }
};

const triggerGeneration = (startTime: number) => {
  lastRequestedTime.value = startTime;
  const downloadUrl = props.absService.getDownloadUrl(props.item.id);
  const duration = props.item.media.duration;
  addToQueue(props.item.id, downloadUrl, duration, startTime);
};

const handleGenerateClick = () => {
  triggerGeneration(props.currentTime);
};

const handleRegenerate = () => {
  deleteTranscript().then(() => {
    handleGenerateClick();
  });
};

watch(queueStatus, (newStatus) => {
  if (newStatus === 'completed') {
    loadTranscript();
    lastRequestedTime.value = null; // Clear lock on success
  }
});

const handleCueClick = (cue: TranscriptCue) => {
  if (cue && typeof cue.start === 'number') {
    emit('seek', cue.start);
  }
};

// Sync Active Cue & Auto-Load Logic
watch(() => props.currentTime, (time) => {
  if (cues.value.length === 0) return;
  
  // 1. Sync Active Cue
  const idx = cues.value.findIndex(c => time >= c.start && time <= c.end);
  if (idx !== -1 && idx !== activeCueIndex.value) {
      activeCueIndex.value = idx;
      if (!isUserScrolling.value) scrollToActive();
  }

  // 2. Auto-Load Logic (Trigger 5s before end)
  const lastCue = cues.value[cues.value.length - 1];
  if (time > (lastCue.end - 5) && !isQueued.value) {
      // Only auto-load if not already failed recently
      if (queueStatus.value !== 'failed') {
          console.log(`[Transcript] Auto-loading next segment starting at ${lastCue.end}`);
          triggerGeneration(lastCue.end);
      }
  }
});

const onScroll = () => {
  isUserScrolling.value = true;
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
  userScrollTimeout = setTimeout(() => {
    isUserScrolling.value = false;
  }, 2000); 
};

const scrollToActive = () => {
  requestAnimationFrame(() => {
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

onUnmounted(() => {
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
});
</script>

<template>
  <div class="w-full h-full bg-black/40 backdrop-blur-xl rounded-[32px] border border-white/10 flex flex-col overflow-hidden relative shadow-2xl">
    
    <!-- Header -->
    <div class="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
      <div class="flex items-center gap-2 px-2">
        <Sparkles :size="12" class="text-purple-500" />
        <span class="text-[9px] font-black uppercase tracking-widest text-white/50">Smart Transcribe</span>
      </div>
      <div class="flex items-center gap-2">
        <button 
          v-if="hasTranscript" 
          @click="deleteTranscript" 
          class="p-2 bg-white/5 rounded-full hover:bg-red-500/20 transition-colors text-neutral-400 hover:text-red-400 border border-white/5"
          title="Delete & Reset"
        >
          <RotateCcw :size="14" />
        </button>
        <button @click="emit('close')" class="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white border border-white/5">
          <X :size="14" />
        </button>
      </div>
    </div>

    <!-- Failed/Retry Overlay (High Priority) -->
    <div v-if="queueStatus === 'failed'" class="absolute inset-0 z-30 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
        <AlertTriangle :size="32" class="text-red-500 mb-4" />
        <h3 class="text-lg font-black uppercase text-white mb-2">Transcription Failed</h3>
        <p class="text-[10px] text-neutral-400 uppercase tracking-widest mb-6 max-w-xs">{{ queueError }}</p>
        
        <button 
          @click="handleGenerateClick"
          class="px-8 py-3 bg-white text-black rounded-full font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
        >
          <RefreshCw :size="14" />
          <span>Try Again</span>
        </button>
    </div>

    <!-- Content Area -->
    <div 
      ref="scrollContainer" 
      @scroll="onScroll"
      class="flex-1 overflow-y-auto custom-scrollbar p-6 relative"
    >
      
      <!-- LOADING STATE (Overlay when initial load) -->
      <div v-if="isQueued && !hasTranscript && queueStatus !== 'failed'" class="absolute inset-0 flex flex-col items-center justify-center gap-6 z-20 bg-black/80 backdrop-blur-md">
        <div class="relative">
          <div class="absolute inset-0 bg-purple-500/30 blur-xl rounded-full animate-pulse" />
          <Loader2 :size="40" class="text-purple-500 animate-spin relative z-10" />
        </div>
        <p class="text-[9px] font-black uppercase tracking-[0.3em] text-white animate-pulse">
           {{ progressLabel }}
        </p>
      </div>

      <!-- No Transcript State -->
      <div v-if="!hasTranscript && !isQueued && queueStatus !== 'failed'" class="h-full flex flex-col items-center justify-center text-center space-y-6 px-4">
        <div class="w-16 h-16 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
           <FileText :size="24" class="text-neutral-500" />
        </div>
        <div class="space-y-1">
          <h3 class="text-sm font-black uppercase tracking-tight text-white">No Transcript</h3>
          <p class="text-[9px] text-neutral-500 leading-relaxed max-w-[200px] mx-auto">
            Sync your playback with AI-generated lyrics.
          </p>
        </div>
        
        <button 
          @click="handleGenerateClick"
          class="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-[0.15em] text-[9px] rounded-full shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all active:scale-95 flex items-center gap-2"
        >
          <Sparkles :size="12" />
          <span>Start Transcribing</span>
        </button>
      </div>

      <!-- Transcript Lines -->
      <div v-if="hasTranscript" class="space-y-6 py-20 flex flex-col items-center min-h-full justify-start w-full">
        <div 
          v-for="(cue, index) in cues" 
          :key="index"
          @click="handleCueClick(cue)"
          class="cursor-pointer transition-all duration-500 p-4 rounded-2xl border border-transparent hover:bg-white/5 w-full max-w-lg flex flex-col gap-2 group"
          :class="activeCueIndex === index ? 'active-cue bg-white/5 border-purple-500/20 scale-105 shadow-lg' : 'opacity-50 hover:opacity-90 blur-[1px] hover:blur-none'"
        >
          <!-- Metadata Header -->
          <div class="flex items-center gap-3">
             <span 
               v-if="cue.speaker"
               class="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border"
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
            v-if="cue.text"
            :key="activeCueIndex === index ? 'active' : 'inactive'"
            class="text-base md:text-lg font-bold leading-relaxed transition-colors duration-300 relative inline-block decoration-clone"
            :class="[
               activeCueIndex === index ? 'text-purple-100 karaoke-text' : 'text-neutral-300',
            ]"
            :style="activeCueIndex === index ? { '--anim-duration': Math.max(0.5, cue.end - cue.start) + 's' } : {}"
          >
            {{ cue.text }}
          </p>
        </div>

        <!-- Non-Blocking Loading Indicator (Bottom) -->
        <div v-if="isQueued && queueStatus !== 'failed'" class="py-6 flex flex-col items-center justify-center gap-3 opacity-80">
           <div class="flex items-center gap-2 px-4 py-2 bg-neutral-900 rounded-full border border-white/10">
              <Loader2 :size="14" class="text-purple-500 animate-spin" />
              <span class="text-[8px] font-black uppercase tracking-widest text-neutral-400">{{ progressLabel }}</span>
           </div>
        </div>
        
        <!-- Manual Load More Button (if lost sync) -->
        <div v-else-if="isOutOfSync && !isQueued" class="py-6">
           <button 
             @click="handleGenerateClick" 
             class="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 rounded-full border border-white/10 text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-white transition-colors"
           >
              <RefreshCw :size="12" />
              <span>Load Next Segment</span>
           </button>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.decoration-clone {
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.karaoke-text {
  background: linear-gradient(to right, #ffffff 50%, #525252 50%);
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
</style>
