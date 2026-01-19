
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { AuthState, ABSLibraryItem, ABSChapter } from '../types';
import { usePlayer } from '../composables/usePlayer';
import { 
  ChevronDown, Play, Pause, Info, X, Activity, Plus, Minus, 
  AlertCircle, RotateCcw, RotateCw, List, Timer
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
});

onUnmounted(() => {
  destroy();
});

const togglePlay = () => state.isPlaying ? pause() : play();
</script>

<template>
  <div class="h-[100dvh] w-full bg-black text-white flex flex-col relative overflow-hidden font-sans select-none safe-top safe-bottom">
    
    <!-- Portal Loader -->
    <Transition name="fade">
      <div v-if="state.isLoading" class="absolute inset-0 bg-black flex flex-col items-center justify-center gap-6 z-[60]">
        <div class="w-16 h-16 border-4 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
        <h2 class="font-black text-purple-500 tracking-[0.5em] text-[10px] uppercase animate-pulse">Establishing Archive Link</h2>
      </div>
    </Transition>

    <!-- Error State -->
    <div v-if="state.error" class="absolute inset-0 bg-black flex flex-col items-center justify-center p-12 gap-8 text-center z-[70]">
      <AlertCircle :size="64" class="text-red-500" />
      <div class="space-y-2">
        <h2 class="text-2xl font-black uppercase tracking-tighter">Archive Connection Error</h2>
        <p class="text-[10px] font-black uppercase tracking-widest text-neutral-500">{{ state.error }}</p>
      </div>
      <button @click="emit('back')" class="w-full max-w-xs py-5 bg-neutral-900 rounded-full font-black uppercase text-xs tracking-widest border border-white/5">Return to Vault</button>
    </div>

    <!-- Main Player UI -->
    <template v-if="!state.error && !state.isLoading">
      <header class="px-8 pt-8 pb-4 flex justify-between items-center z-20 shrink-0">
        <button @click="emit('back')" class="bg-neutral-900/40 p-3 rounded-2xl border border-white/5 active:scale-90 transition-all">
          <ChevronDown :size="20" class="text-neutral-500" />
        </button>
        <button @click="showChapters = true" class="flex items-center gap-3 bg-neutral-900/60 pl-5 pr-4 py-2.5 rounded-full border border-white/5 active:scale-95 transition-all max-w-[60%]">
          <span class="text-[10px] font-black uppercase tracking-widest text-purple-500 truncate">{{ currentChapter?.title || 'Archive Index' }}</span>
          <List :size="16" class="text-purple-500 shrink-0" />
        </button>
        <button @click="showInfo = true" class="bg-neutral-900/40 p-3 rounded-2xl border border-white/5 active:scale-90 transition-all">
          <Info :size="20" class="text-neutral-500" />
        </button>
      </header>

      <div class="flex-1 flex flex-col items-center justify-center px-8 relative">
        <div class="relative w-full max-w-[320px] aspect-square group">
          <div class="absolute -inset-10 bg-purple-600/10 blur-[100px] rounded-full opacity-50" />
          <img :src="coverUrl" class="w-full h-full object-cover rounded-[56px] shadow-[0_32px_64px_rgba(0,0,0,0.8)] border border-white/10 relative z-10" />
          
          <div v-if="sleepSeconds > 0" class="absolute top-6 left-6 z-20 flex items-center gap-2 bg-purple-600/90 backdrop-blur-xl px-4 py-2 rounded-full border border-white/20">
            <Timer :size="14" class="text-white" />
            <span class="text-[10px] font-black font-mono text-white">{{ secondsToTimestamp(sleepSeconds) }}</span>
          </div>
        </div>
        
        <div class="mt-12 text-center space-y-2 w-full max-w-md px-4">
          <h1 class="text-2xl font-black uppercase tracking-tighter line-clamp-1 leading-tight">{{ item.media.metadata.title }}</h1>
          <p class="text-neutral-500 text-[10px] font-black uppercase tracking-[0.4em]">{{ item.media.metadata.authorName }}</p>
        </div>
      </div>

      <footer class="px-8 pb-10 space-y-8 max-w-xl mx-auto w-full">
        <div class="space-y-4">
          <div class="flex justify-between items-end text-[10px] font-black font-mono px-1">
            <div class="flex flex-col">
              <span class="text-neutral-700 text-[8px] uppercase mb-0.5">Sync</span>
              <span class="text-white">{{ secondsToTimestamp(state.currentTime) }}</span>
            </div>
            <div class="flex flex-col items-end">
              <span class="text-neutral-700 text-[8px] uppercase mb-0.5">Portal Rem.</span>
              <span class="text-purple-500">-{{ secondsToTimestamp(timeRemaining) }}</span>
            </div>
          </div>
          
          <div 
            class="h-1.5 w-full bg-neutral-900 rounded-full relative cursor-pointer overflow-hidden" 
            @click="(e: any) => seek((e.offsetX / e.currentTarget.clientWidth) * state.duration)"
          >
            <div class="absolute inset-y-0 left-0 bg-neutral-800 transition-all duration-500" :style="{ width: bufferPercent + '%' }" />
            <div class="absolute inset-y-0 left-0 gradient-aether shadow-aether-glow transition-all duration-150" :style="{ width: progressPercent + '%' }" />
          </div>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 bg-neutral-900/40 p-2 rounded-2xl border border-white/5">
            <button @click="setPlaybackRate(Math.max(0.5, state.playbackRate - 0.1))" class="p-2 text-neutral-500"><Minus :size="14" /></button>
            <span class="text-[10px] font-black font-mono text-purple-500 w-8 text-center">{{ state.playbackRate.toFixed(1) }}x</span>
            <button @click="setPlaybackRate(Math.min(2.5, state.playbackRate + 0.1))" class="p-2 text-neutral-500"><Plus :size="14" /></button>
          </div>

          <div class="flex items-center gap-6">
            <button @click="seek(state.currentTime - 15)" class="text-neutral-500 active:scale-90 transition-transform"><RotateCcw :size="24" /></button>
            <button @click="togglePlay" class="w-20 h-20 rounded-full gradient-aether flex items-center justify-center shadow-aether-glow active:scale-95 transition-all">
              <Pause v-if="state.isPlaying" :size="32" class="text-white fill-current" />
              <Play v-else :size="32" class="text-white fill-current translate-x-1" />
            </button>
            <button @click="seek(state.currentTime + 30)" class="text-neutral-500 active:scale-90 transition-transform"><RotateCw :size="24" /></button>
          </div>

          <button @click="sleepSeconds = sleepSeconds === 0 ? 1800 : 0" class="flex items-center gap-2 bg-neutral-900/40 p-3 rounded-2xl border border-white/5 transition-colors" :class="sleepSeconds > 0 ? 'border-purple-600/40 text-purple-500' : 'text-neutral-500'">
            <Timer :size="18" />
            <span class="text-[10px] font-black uppercase">{{ sleepSeconds > 0 ? 'Active' : 'Off' }}</span>
          </button>
        </div>
      </footer>
    </template>

    <!-- Index View (Chapters) -->
    <Transition name="slide-up">
      <div v-if="showChapters" class="fixed inset-0 bg-black z-[100] flex flex-col">
        <header class="p-8 border-b border-white/5 flex justify-between items-center bg-neutral-950/50 backdrop-blur-xl">
          <h2 class="text-xl font-black uppercase tracking-widest text-purple-500">Archive Index</h2>
          <button @click="showChapters = false" class="p-3 bg-neutral-900 rounded-2xl text-neutral-500 active:scale-90"><X :size="20"/></button>
        </header>
        <div class="flex-1 overflow-y-auto p-4 no-scrollbar max-w-2xl mx-auto w-full">
          <button 
            v-for="(ch, i) in chapters" 
            :key="i" 
            @click="seek(ch.start); showChapters = false;"
            class="w-full flex items-center justify-between p-6 rounded-[32px] mb-3 transition-all border border-transparent"
            :class="currentChapterIndex === i ? 'bg-purple-600/10 border-purple-600/30' : 'hover:bg-neutral-900'"
          >
            <div class="flex flex-col items-start gap-1">
              <span class="text-sm font-black uppercase tracking-tight text-left" :class="currentChapterIndex === i ? 'text-purple-500' : 'text-neutral-300'">{{ ch.title }}</span>
              <span class="text-[9px] font-black text-neutral-600 uppercase tracking-widest">{{ secondsToTimestamp(ch.end - ch.start) }} Segment</span>
            </div>
            <Activity v-if="currentChapterIndex === i" :size="16" class="text-purple-500 animate-pulse" />
            <span v-else class="text-[10px] font-mono text-neutral-800">{{ secondsToTimestamp(ch.start) }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
