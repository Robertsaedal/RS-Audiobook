
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { TranscriptionService } from '../services/transcriptionService';
import { TranscriptCue } from '../services/db';
import { ABSLibraryItem } from '../types';
import { ABSService } from '../services/absService';
import { X, Volume2, FileText, Send, CheckCircle, AlertTriangle, Loader2 } from 'lucide-vue-next';
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
const activeCueIndex = ref(-1);
const scrollContainer = ref<HTMLElement | null>(null);
const isUserScrolling = ref(false);
let userScrollTimeout: any = null;

// Request State
const requestStatus = ref<'idle' | 'sending' | 'success' | 'error'>('idle');

const loadTranscript = async () => {
  isLoading.value = true;
  requestStatus.value = 'idle';
  
  try {
    const result = await TranscriptionService.getTranscript(props.item.id, props.absService || null);
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
        <FileText :size="12" class="text-purple-500" />
        <span class="text-[9px] font-black uppercase tracking-widest text-white/50">Lyrics / Text</span>
      </div>
      <button @click="emit('close')" class="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white border border-white/5">
        <X :size="14" />
      </button>
    </div>

    <!-- Content Area -->
    <div 
      ref="scrollContainer" 
      @scroll="onScroll"
      class="flex-1 overflow-y-auto custom-scrollbar p-6 relative"
    >
      
      <!-- LOADING STATE -->
      <div v-if="isLoading" class="absolute inset-0 flex flex-col items-center justify-center gap-6 z-20">
        <Loader2 :size="32" class="text-purple-500 animate-spin" />
      </div>

      <!-- No Transcript / Request State -->
      <div v-else-if="!hasTranscript" class="h-full flex flex-col items-center justify-center text-center space-y-6 px-6">
        <div class="w-16 h-16 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
           <FileText :size="24" class="text-neutral-600" />
        </div>
        
        <div class="space-y-2">
          <h3 class="text-sm font-black uppercase tracking-tight text-white">Transcript Unavailable</h3>
          <p class="text-[10px] text-neutral-500 leading-relaxed max-w-[220px] mx-auto">
            This artifact does not have a synchronized JSON file in the archive.
          </p>
        </div>
        
        <!-- Request Button States -->
        <div class="pt-4">
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

            <p v-if="requestStatus === 'error'" class="text-[8px] text-red-500 font-bold uppercase mt-3 tracking-wide flex items-center justify-center gap-1">
               <AlertTriangle :size="10" /> Connection Failed
            </p>
        </div>
      </div>

      <!-- Transcript Lines -->
      <div v-else class="space-y-6 py-20 flex flex-col items-center min-h-full justify-start w-full">
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
            class="text-base md:text-lg font-bold leading-relaxed transition-colors duration-300 relative inline-block decoration-clone"
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
