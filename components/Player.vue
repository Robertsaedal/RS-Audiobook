
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { AuthState, ABSLibraryItem, ABSChapter } from '../types';
import { usePlayer } from '../composables/usePlayer';
import { 
  ChevronDown, Play, Pause, Info, X, Activity, Plus, Minus, 
  AlertCircle, RotateCcw, RotateCw, List, Timer,
  SkipBack, SkipForward, Headphones, Gauge, Moon, ChevronRight
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
const sleepAtChapterEnd = ref(false);
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

// Chapter-based progress logic
const chapterProgressPercent = computed(() => {
  if (!currentChapter.value) return 0;
  const chapterDuration = currentChapter.value.end - currentChapter.value.start;
  const elapsedInChapter = state.currentTime - currentChapter.value.start;
  return Math.min(100, Math.max(0, (elapsedInChapter / chapterDuration) * 100));
});

const timeRemainingInChapter = computed(() => {
  if (!currentChapter.value) return 0;
  return Math.max(0, currentChapter.value.end - state.currentTime);
});

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
    // Chapter-end sleep logic
    if (sleepAtChapterEnd.value && currentChapter.value) {
      if (timeRemainingInChapter.value < 0.5) {
        pause();
        sleepAtChapterEnd.value = false;
      }
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
  if (sleepSeconds.value > 0) sleepAtChapterEnd.value = false;
};

const toggleChapterSleep = () => {
  sleepAtChapterEnd.value = !sleepAtChapterEnd.value;
  if (sleepAtChapterEnd.value) sleepSeconds.value = 0;
};

const metadata = computed(() => props.item.media.metadata);
</script>

<template>
  <div class="h-[100dvh] w-full bg-black text-white flex flex-col relative overflow-hidden font-sans select-none safe-top safe-bottom">
    
    <!-- Minimalist Ambient Glow -->
    <div class="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
      <div class="w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[140px] animate-pulse" />
    </div>

    <!-- Portal Loader -->
    <Transition name="fade">
      <div v-if="state.isLoading" class="absolute inset-0 bg-black flex flex-col items-center justify-center gap-6 z-[100]">
        <div class="w-12 h-12 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
        <p class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-600">Syncing Archive...</p>
      </div>
    </Transition>

    <template v-if="!state.isLoading">
      <!-- Header Navigation -->
      <header class="px-8 py-8 flex justify-between items-center z-20 shrink-0">
        <button @click="emit('back')" class="p-2 text-neutral-600 hover:text-white transition-colors active:scale-90">
          <ChevronDown :size="24" stroke-width="1.5" />
        </button>
        
        <button @click="showChapters = true" class="flex flex-col items-center gap-1 group">
          <span class="text-[7px] font-black uppercase tracking-[0.5em] text-neutral-700 group-hover:text-purple-500 transition-colors">ARCHIVE INDEX</span>
          <div class="flex items-center gap-2 max-w-[200px]">
            <span class="text-[9px] font-black uppercase tracking-widest text-neutral-300 truncate">
              {{ currentChapter?.title || 'Segment 01' }}
            </span>
            <ChevronRight :size="10" class="text-neutral-700" />
          </div>
        </button>

        <button @click="showInfo = true" class="p-2 text-neutral-600 hover:text-white transition-colors active:scale-90">
          <Info :size="20" stroke-width="1.5" />
        </button>
      </header>

      <!-- Central Artifact Area -->
      <div class="flex-1 flex flex-col items-center justify-center px-8 relative gap-12">
        <!-- Artifact Cover -->
        <div class="relative w-full max-w-[280px] aspect-square group">
          <div class="absolute -inset-8 bg-purple-600/5 blur-[80px] rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
          <div class="relative z-10 w-full h-full rounded-[48px] overflow-hidden border border-white/5 shadow-2xl transition-transform duration-700 group-hover:scale-[1.02]">
            <img :src="coverUrl" class="w-full h-full object-cover" />
          </div>
        </div>
        
        <!-- Metadata Stack -->
        <div class="text-center space-y-4 w-full max-w-md px-4 z-10">
          <div class="space-y-1">
            <p v-if="metadata.seriesName" class="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-600">
              {{ metadata.seriesName }} <span class="mx-1 text-purple-900">—</span> BOOK {{ metadata.sequence || '01' }}
            </p>
            <h1 class="text-xl md:text-2xl font-black uppercase tracking-tight text-white leading-tight line-clamp-2">{{ metadata.title }}</h1>
            <p class="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-500">{{ metadata.authorName }}</p>
          </div>

          <!-- Refined Timer -->
          <div class="pt-2">
            <div class="text-4xl font-black font-mono-timer tabular-nums tracking-tighter text-white">
              {{ secondsToTimestamp(state.currentTime) }}
            </div>
            <p class="text-[7px] font-black uppercase tracking-[0.6em] text-neutral-700 mt-2">LINKED SESSION</p>
          </div>
        </div>
      </div>

      <!-- Playback Interface -->
      <footer class="px-10 pb-16 space-y-12 max-w-xl mx-auto w-full z-20">
        <!-- Modern Chapter Progress Bar -->
        <div class="space-y-3">
          <div 
            class="h-0.5 w-full bg-neutral-900 rounded-full relative cursor-pointer group" 
            @click="(e: any) => {
              if(!currentChapter) return;
              const clickPos = e.offsetX / e.currentTarget.clientWidth;
              const chapterDur = currentChapter.end - currentChapter.start;
              seek(currentChapter.start + (clickPos * chapterDur));
            }"
          >
            <!-- Background track -->
            <div class="absolute inset-0 bg-white/5 rounded-full" />
            <!-- Glowing Progress Line -->
            <div 
              class="absolute inset-y-0 left-0 bg-purple-500 shadow-[0_0_8px_rgba(157,80,187,1)] transition-all duration-150 rounded-full" 
              :style="{ width: chapterProgressPercent + '%' }"
            />
          </div>
          <div class="flex justify-between items-center text-[8px] font-bold font-mono text-neutral-600 tracking-widest">
            <span>{{ secondsToTimestamp(state.currentTime - (currentChapter?.start || 0)) }}</span>
            <span class="text-purple-900/40 uppercase tracking-[0.2em] font-black">Chapter Segment</span>
            <span>-{{ secondsToTimestamp(timeRemainingInChapter) }}</span>
          </div>
        </div>

        <!-- Master Controls -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-6">
            <button @click="seek(state.currentTime - 15)" class="text-neutral-700 hover:text-purple-500 transition-colors active:scale-90">
              <RotateCcw :size="24" stroke-width="1.5" />
            </button>
            <button @click="prevChapter" class="text-neutral-800 hover:text-white transition-colors">
              <SkipBack :size="20" stroke-width="2" class="fill-current" />
            </button>
          </div>

          <button @click="togglePlay" class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center border border-purple-500/20 shadow-[0_0_40px_rgba(157,80,187,0.15)] active:scale-95 transition-all group overflow-hidden">
            <div class="absolute inset-0 bg-purple-600/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Pause v-if="state.isPlaying" :size="32" class="text-purple-500 fill-current" />
            <Play v-else :size="32" class="text-purple-500 fill-current translate-x-1" />
          </button>

          <div class="flex items-center gap-6">
            <button @click="nextChapter" class="text-neutral-800 hover:text-white transition-colors">
              <SkipForward :size="20" stroke-width="2" class="fill-current" />
            </button>
            <button @click="seek(state.currentTime + 30)" class="text-neutral-700 hover:text-purple-500 transition-colors active:scale-90">
              <RotateCw :size="24" stroke-width="1.5" />
            </button>
          </div>
        </div>

        <!-- Utility Grid -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Speed Control -->
          <div class="bg-neutral-900/30 border border-white/5 rounded-3xl p-5 flex flex-col items-center gap-4">
            <div class="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] text-neutral-600">
              <Gauge :size="12" stroke-width="1.5" />
              <span>Speed</span>
            </div>
            <div class="flex items-center justify-between w-full px-2">
              <button @click="setPlaybackRate(Math.max(0.5, state.playbackRate - 0.1))" class="w-8 h-8 rounded-xl hover:bg-white/5 flex items-center justify-center transition-colors">
                <Minus :size="12" />
              </button>
              <span class="text-xs font-black font-mono text-purple-500">{{ state.playbackRate.toFixed(1) }}x</span>
              <button @click="setPlaybackRate(Math.min(2.5, state.playbackRate + 0.1))" class="w-8 h-8 rounded-xl hover:bg-white/5 flex items-center justify-center transition-colors">
                <Plus :size="12" />
              </button>
            </div>
          </div>

          <!-- Sleep Control -->
          <div class="bg-neutral-900/30 border border-white/5 rounded-3xl p-5 flex flex-col items-center gap-4">
            <div class="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] text-neutral-600">
              <Moon :size="12" stroke-width="1.5" />
              <span>Sleep</span>
            </div>
            <div class="flex items-center justify-between w-full px-2">
              <button @click="adjustSleep(-15)" class="w-8 h-8 rounded-xl hover:bg-white/5 flex items-center justify-center">
                <Minus :size="12" />
              </button>
              <button @click="toggleChapterSleep" class="flex flex-col items-center">
                <span v-if="sleepAtChapterEnd" class="text-[7px] font-black text-purple-500 uppercase">End of Ch.</span>
                <span v-else class="text-xs font-black font-mono" :class="sleepSeconds > 0 ? 'text-purple-500' : 'text-neutral-700'">
                  {{ sleepSeconds > 0 ? Math.ceil(sleepSeconds / 60) + 'm' : 'Off' }}
                </span>
              </button>
              <button @click="adjustSleep(15)" class="w-8 h-8 rounded-xl hover:bg-white/5 flex items-center justify-center">
                <Plus :size="12" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </template>

    <!-- Archive Index Overlay -->
    <Transition name="slide-up">
      <div v-if="showChapters" class="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[150] flex flex-col">
        <header class="p-10 flex justify-between items-center bg-transparent shrink-0">
          <div class="space-y-1">
            <h2 class="text-2xl font-black uppercase tracking-tighter text-white">ARCHIVE INDEX</h2>
            <p class="text-[8px] font-black uppercase tracking-[0.5em] text-purple-600">Captured Volume Segments</p>
          </div>
          <button @click="showChapters = false" class="p-4 bg-neutral-900/50 rounded-3xl text-neutral-500 hover:text-white border border-white/5">
            <X :size="20"/>
          </button>
        </header>
        
        <div class="flex-1 overflow-y-auto p-8 no-scrollbar max-w-2xl mx-auto w-full pb-32">
          <button 
            v-for="(ch, i) in chapters" 
            :key="i" 
            @click="seek(ch.start); showChapters = false;"
            class="w-full flex items-center justify-between p-6 rounded-[24px] mb-3 transition-all border border-transparent group"
            :class="currentChapterIndex === i ? 'bg-purple-600/5 border-purple-500/20' : 'hover:bg-neutral-900/30'"
          >
            <div class="flex flex-col items-start gap-1">
              <span class="text-[11px] font-black uppercase tracking-tight" :class="currentChapterIndex === i ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'">
                {{ ch.title }}
              </span>
              <span class="text-[8px] font-mono text-neutral-700 tabular-nums">{{ secondsToTimestamp(ch.start) }}</span>
            </div>
            
            <div v-if="currentChapterIndex === i" class="flex gap-0.5">
              <div class="w-0.5 h-3 bg-purple-500 animate-[bounce_1s_infinite_100ms]" />
              <div class="w-0.5 h-4 bg-purple-500 animate-[bounce_1s_infinite_300ms]" />
              <div class="w-0.5 h-2 bg-purple-500 animate-[bounce_1s_infinite_500ms]" />
            </div>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
}

@keyframes bounce {
  0%, 100% { transform: scaleY(1); opacity: 0.5; }
  50% { transform: scaleY(1.5); opacity: 1; }
}
</style>
