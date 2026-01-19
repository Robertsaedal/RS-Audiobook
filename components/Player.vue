
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { AuthState, ABSLibraryItem, ABSChapter } from '../types';
import { usePlayer } from '../composables/usePlayer';
import { 
  ChevronDown, Play, Pause, Info, X, Activity, Plus, Minus, 
  AlertCircle, RotateCcw, RotateCw, List, Timer,
  SkipBack, SkipForward, Headphones, SlidersHorizontal
} from 'lucide-vue-next';

const props = defineProps<{
  auth: AuthState,
  item: ABSLibraryItem
}>();

const emit = defineEmits<{
  (e: 'back'): void
}>();

const { state, load, play, pause, seek, setPlaybackRate, destroy } = usePlayer();

const showChapters = ref(false);
const showInfo = ref(false);
const sleepSeconds = ref(0);
let sleepInterval: any = null;

const coverUrl = computed(() => {
  const baseUrl = props.auth.serverUrl.replace(/\/api\/?$/, '');
  return `${baseUrl}/api/items/${props.item.id}/cover?token=${props.auth.user?.token}`;
});

const chapters = computed(() => props.item.media.chapters || []);

const currentChapterIndex = computed(() => {
  if (!chapters.value.length) return -1;
  return chapters.value.findIndex((ch, i) => 
    state.currentTime >= ch.start && (i === chapters.value.length - 1 || state.currentTime < (chapters.value[i+1]?.start || ch.end))
  );
});

const currentChapter = computed(() => currentChapterIndex.value !== -1 ? chapters.value[currentChapterIndex.value] : null);
const timeRemaining = computed(() => Math.max(0, state.duration - state.currentTime));
const progressPercent = computed(() => state.duration ? (state.currentTime / state.duration) * 100 : 0);
const bufferPercent = computed(() => state.duration ? (state.bufferedTime / state.duration) * 100 : 0);

const secondsToTimestamp = (s: number) => {
  if (isNaN(s) || s < 0) return "00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${sec.toString().padStart(2, '0')}`;
};

onMounted(() => {
  load(props.item, props.auth);
  sleepInterval = setInterval(() => {
    if (sleepSeconds.value > 0) {
      sleepSeconds.value--;
      if (sleepSeconds.value <= 0) pause();
    }
  }, 1000);
});

onUnmounted(() => {
  destroy();
  if (sleepInterval) clearInterval(sleepInterval);
});

const togglePlay = () => state.isPlaying ? pause() : play();

const nextChapter = () => {
  if (currentChapterIndex.value < chapters.value.length - 1) {
    seek(chapters.value[currentChapterIndex.value + 1].start);
  }
};

const prevChapter = () => {
  if (state.currentTime - (currentChapter.value?.start || 0) > 5) {
    seek(currentChapter.value?.start || 0);
  } else if (currentChapterIndex.value > 0) {
    seek(chapters.value[currentChapterIndex.value - 1].start);
  }
};

const adjustSleep = (mins: number) => {
  sleepSeconds.value = Math.max(0, sleepSeconds.value + (mins * 60));
};
</script>

<template>
  <div class="h-[100dvh] w-full bg-black text-white flex flex-col relative overflow-hidden font-sans select-none safe-top safe-bottom">
    
    <!-- Aether Background Pulse -->
    <div class="absolute inset-0 z-0 pointer-events-none">
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-600/5 rounded-full blur-[160px] animate-pulse" />
      <div class="absolute -top-40 -right-40 w-96 h-96 bg-purple-900/10 rounded-full blur-[100px]" />
    </div>

    <!-- Portal Loader Overlay -->
    <Transition name="fade">
      <div v-if="state.isLoading" class="absolute inset-0 bg-black flex flex-col items-center justify-center gap-8 z-[100]">
        <div class="relative">
          <div class="w-20 h-20 border-4 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
          <Headphones class="absolute inset-0 m-auto text-purple-500 animate-pulse" :size="24" />
        </div>
        <div class="text-center space-y-2">
          <h2 class="font-black text-purple-500 tracking-[0.6em] text-[10px] uppercase">ESTABLISHING LINK</h2>
          <p class="text-neutral-700 text-[8px] font-black uppercase tracking-widest">Aether Protocol v5.2</p>
        </div>
      </div>
    </Transition>

    <!-- Error State Overlay -->
    <div v-if="state.error" class="absolute inset-0 bg-black flex flex-col items-center justify-center p-12 gap-8 text-center z-[110] backdrop-blur-xl">
      <div class="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
        <AlertCircle :size="48" class="text-red-500" />
      </div>
      <div class="space-y-3">
        <h2 class="text-3xl font-black uppercase tracking-tighter">ARCHIVE SEVERED</h2>
        <p class="text-[10px] font-black uppercase tracking-widest text-neutral-500 max-w-xs mx-auto leading-relaxed">{{ state.error }}</p>
      </div>
      <button @click="emit('back')" class="w-full max-w-xs py-6 gradient-aether rounded-full font-black uppercase text-xs tracking-[0.3em] shadow-lg active:scale-[0.98] transition-all">RETURN TO VAULT</button>
    </div>

    <!-- Main Player UI -->
    <template v-if="!state.error && !state.isLoading">
      
      <!-- Top Navigation -->
      <header class="px-8 py-6 flex justify-between items-center z-20 shrink-0 relative">
        <button @click="emit('back')" class="bg-neutral-900/40 p-3.5 rounded-2xl border border-white/5 active:scale-90 transition-all backdrop-blur-xl group">
          <ChevronDown :size="20" class="text-neutral-500 group-hover:text-white transition-colors" />
        </button>
        
        <button @click="showChapters = true" class="flex flex-col items-center gap-1 group">
          <span class="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-600 group-hover:text-purple-500 transition-colors">CHAPTER INDEX</span>
          <div class="flex items-center gap-2 max-w-[180px]">
            <span class="text-[10px] font-black uppercase tracking-widest text-white truncate drop-shadow-sm">{{ currentChapter?.title || 'Archive Metadata' }}</span>
            <Activity :size="10" class="text-purple-600 animate-pulse shrink-0" />
          </div>
        </button>

        <button @click="showInfo = true" class="bg-neutral-900/40 p-3.5 rounded-2xl border border-white/5 active:scale-90 transition-all backdrop-blur-xl group">
          <Info :size="20" class="text-neutral-500 group-hover:text-white transition-colors" />
        </button>
      </header>

      <!-- Central Visual & Timer -->
      <div class="flex-1 flex flex-col items-center justify-center px-8 relative gap-10">
        <!-- Depth Blur Background -->
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-[400px] aspect-square overflow-hidden pointer-events-none opacity-20">
          <img :src="coverUrl" class="w-full h-full object-cover blur-[120px] scale-150" />
        </div>

        <!-- Cover Art Card -->
        <div class="relative w-full max-w-[320px] aspect-square group perspective-1000">
          <div class="absolute -inset-4 bg-purple-600/20 blur-[60px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity" />
          <div class="relative z-10 w-full h-full rounded-[56px] overflow-hidden border border-purple-500/50 shadow-[0_32px_80px_rgba(0,0,0,0.9)] transition-transform duration-700 group-hover:scale-[1.02]">
            <img :src="coverUrl" class="w-full h-full object-cover" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          
          <!-- Sleep Indicator Badge -->
          <Transition name="fade">
            <div v-if="sleepSeconds > 0" class="absolute -top-3 -right-3 z-30 flex items-center gap-2 bg-purple-600 p-4 rounded-3xl border border-white/20 shadow-2xl animate-slide-up">
              <Timer :size="16" class="text-white" />
              <span class="text-xs font-black font-mono tabular-nums text-white">{{ secondsToTimestamp(sleepSeconds) }}</span>
            </div>
          </Transition>
        </div>
        
        <!-- Metadata & Focal Timer -->
        <div class="text-center space-y-6 w-full max-w-md px-4 z-10">
          <div class="space-y-1.5">
            <h1 class="text-3xl font-black uppercase tracking-tighter text-white leading-none line-clamp-1 drop-shadow-2xl">{{ item.media.metadata.title }}</h1>
            <p class="text-neutral-500 text-[10px] font-black uppercase tracking-[0.5em]">{{ item.media.metadata.authorName }}</p>
          </div>

          <!-- Big Focal Timer -->
          <div class="flex flex-col items-center">
            <div class="text-[56px] font-black font-mono tabular-nums tracking-tighter leading-none text-white drop-shadow-[0_0_20px_rgba(157,80,187,0.3)]">
              {{ secondsToTimestamp(state.currentTime) }}
            </div>
            <div class="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-neutral-600 mt-2">
              <span class="text-purple-600/60">-{{ secondsToTimestamp(timeRemaining) }}</span>
              <span class="opacity-20">|</span>
              <span>EST. PORTAL EXIT</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Playback Controls Footer -->
      <footer class="px-8 pb-12 space-y-10 max-w-xl mx-auto w-full z-20">
        <!-- Sleek Progress Bar -->
        <div class="space-y-3 px-2">
          <div 
            class="h-1.5 w-full bg-neutral-900/60 rounded-full relative cursor-pointer overflow-hidden backdrop-blur-sm group" 
            @click="(e: any) => seek((e.offsetX / e.currentTarget.clientWidth) * state.duration)"
          >
            <!-- Buffered -->
            <div class="absolute inset-y-0 left-0 bg-white/5 transition-all duration-500" :style="{ width: bufferPercent + '%' }" />
            <!-- Active Progress -->
            <div class="absolute inset-y-0 left-0 gradient-aether shadow-aether-glow transition-all duration-150 rounded-full" :style="{ width: progressPercent + '%' }">
              <div class="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>

        <!-- Main Transport -->
        <div class="flex items-center justify-between">
          <!-- Seek Controls -->
          <div class="flex items-center gap-4">
            <button @click="seek(state.currentTime - 15)" class="text-neutral-600 hover:text-purple-500 active:scale-90 transition-all p-2">
              <RotateCcw :size="28" />
            </button>
            <button @click="prevChapter" class="text-neutral-700 hover:text-white active:scale-90 transition-all">
              <SkipBack :size="24" class="fill-current" />
            </button>
          </div>

          <!-- Central Play Trigger -->
          <button @click="togglePlay" class="w-24 h-24 rounded-full gradient-aether flex items-center justify-center shadow-[0_15px_40px_rgba(157,80,187,0.4)] active:scale-95 transition-all relative group overflow-hidden">
            <div class="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Pause v-if="state.isPlaying" :size="40" class="text-white fill-current" />
            <Play v-else :size="40" class="text-white fill-current translate-x-1" />
          </button>

          <!-- Forward Controls -->
          <div class="flex items-center gap-4">
            <button @click="nextChapter" class="text-neutral-700 hover:text-white active:scale-90 transition-all">
              <SkipForward :size="24" class="fill-current" />
            </button>
            <button @click="seek(state.currentTime + 30)" class="text-neutral-600 hover:text-purple-500 active:scale-90 transition-all p-2">
              <RotateCw :size="28" />
            </button>
          </div>
        </div>

        <!-- Feature Action Cards -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Speed Card -->
          <div class="bg-neutral-900/40 backdrop-blur-2xl border border-white/5 rounded-[32px] p-5 flex flex-col items-center gap-4 group">
            <div class="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500">
              <SlidersHorizontal :size="12" />
              <span>TEMPO</span>
            </div>
            <div class="flex items-center justify-between w-full px-2">
              <button @click="setPlaybackRate(Math.max(0.5, state.playbackRate - 0.1))" class="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-purple-600/20 active:scale-90 transition-all">
                <Minus :size="14" class="text-neutral-400" />
              </button>
              <span class="text-sm font-black font-mono tabular-nums text-purple-500">{{ state.playbackRate.toFixed(1) }}x</span>
              <button @click="setPlaybackRate(Math.min(2.5, state.playbackRate + 0.1))" class="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-purple-600/20 active:scale-90 transition-all">
                <Plus :size="14" class="text-neutral-400" />
              </button>
            </div>
          </div>

          <!-- Sleep Card -->
          <div class="bg-neutral-900/40 backdrop-blur-2xl border border-white/5 rounded-[32px] p-5 flex flex-col items-center gap-4">
            <div class="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500">
              <Timer :size="12" />
              <span>DORMANCY</span>
            </div>
            <div class="flex items-center justify-between w-full px-2">
              <button @click="adjustSleep(-15)" class="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-purple-600/20 active:scale-90 transition-all">
                <Minus :size="14" class="text-neutral-400" />
              </button>
              <span class="text-sm font-black font-mono tabular-nums" :class="sleepSeconds > 0 ? 'text-purple-500' : 'text-neutral-700'">
                {{ sleepSeconds > 0 ? Math.ceil(sleepSeconds / 60) : 'OFF' }}
              </span>
              <button @click="adjustSleep(15)" class="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-purple-600/20 active:scale-90 transition-all">
                <Plus :size="14" class="text-neutral-400" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </template>

    <!-- Index View (Chapters Overlay) -->
    <Transition name="slide-up">
      <div v-if="showChapters" class="fixed inset-0 bg-black/80 backdrop-blur-3xl z-[150] flex flex-col animate-slide-up">
        <header class="p-10 flex justify-between items-center bg-transparent shrink-0">
          <div class="space-y-1">
            <h2 class="text-3xl font-black uppercase tracking-tighter text-white">ARCHIVE INDEX</h2>
            <p class="text-[9px] font-black uppercase tracking-[0.5em] text-purple-600">Volume Segments Captured</p>
          </div>
          <button @click="showChapters = false" class="p-4 bg-neutral-900 rounded-[28px] text-neutral-500 active:scale-90 border border-white/5">
            <X :size="24"/>
          </button>
        </header>
        
        <div class="flex-1 overflow-y-auto p-8 no-scrollbar max-w-2xl mx-auto w-full pb-32">
          <button 
            v-for="(ch, i) in chapters" 
            :key="i" 
            @click="seek(ch.start); showChapters = false;"
            class="w-full flex items-center justify-between p-8 rounded-[40px] mb-4 transition-all border border-transparent group relative overflow-hidden"
            :class="currentChapterIndex === i ? 'bg-purple-600/10 border-purple-600/30' : 'hover:bg-neutral-900/50'"
          >
            <div class="flex flex-col items-start gap-1 z-10">
              <span class="text-sm font-black uppercase tracking-tight text-left leading-tight" :class="currentChapterIndex === i ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'">{{ ch.title }}</span>
              <div class="flex items-center gap-2">
                <span class="text-[9px] font-black text-neutral-600 uppercase tracking-widest">{{ secondsToTimestamp(ch.end - ch.start) }}</span>
                <span class="text-purple-900/40 text-[8px]">•</span>
                <span class="text-[9px] font-mono text-neutral-800 tabular-nums">{{ secondsToTimestamp(ch.start) }}</span>
              </div>
            </div>
            
            <div v-if="currentChapterIndex === i" class="flex items-center gap-3 z-10">
              <div class="flex gap-1">
                <div class="w-1 h-3 bg-purple-500 animate-[bounce_1s_infinite_100ms]" />
                <div class="w-1 h-5 bg-purple-500 animate-[bounce_1s_infinite_300ms]" />
                <div class="w-1 h-2 bg-purple-500 animate-[bounce_1s_infinite_500ms]" />
              </div>
            </div>
          </button>
        </div>
        
        <div class="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent pointer-events-none" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.perspective-1000 {
  perspective: 1000px;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
}

@keyframes bounce {
  0%, 100% { transform: scaleY(1); opacity: 0.5; }
  50% { transform: scaleY(1.8); opacity: 1; }
}

/* Tabular numbers for all monospace timer fonts */
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>
