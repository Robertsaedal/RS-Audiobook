
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { AuthState, ABSLibraryItem } from '../types';
import { usePlayer } from '../composables/usePlayer';
import ChapterEditor from '../components/ChapterEditor.vue';
import { 
  ChevronDown, Play, Pause, Info, X, SkipBack, SkipForward,
  RotateCcw, RotateCw, ChevronRight, Gauge, Moon, Plus, Minus, Database, Mic, Clock, User, Book, Layers, Edit3
} from 'lucide-vue-next';

const props = defineProps<{
  auth: AuthState,
  item: ABSLibraryItem
}>();

const emit = defineEmits<{
  (e: 'back'): void,
  (e: 'select-series', seriesId: string): void,
  (e: 'item-updated', updatedItem: ABSLibraryItem): void
}>();

const { state, load, play, pause, seek, setPlaybackRate, destroy } = usePlayer();

const showChapters = ref(false);
const showInfo = ref(false);
const showChapterEditor = ref(false);

const coverUrl = computed(() => {
  const baseUrl = props.auth.serverUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  return `${baseUrl}/api/items/${props.item.id}/cover?token=${props.auth.user?.token}`;
});

const chapters = computed(() => {
  if (!props.item?.media?.chapters) return [];
  return props.item.media.chapters;
});

const currentChapterIndex = computed(() => {
  if (!chapters.value || chapters.value.length === 0) return -1;
  const time = state.currentTime + 0.1;
  return chapters.value.findIndex((ch, i) => 
    time >= ch.start && (i === chapters.value.length - 1 || time < (chapters[i+1]?.start || ch.end))
  );
});

const currentChapter = computed(() => currentChapterIndex.value !== -1 ? chapters.value[currentChapterIndex.value] : null);

const chapterProgressPercent = computed(() => {
  if (!currentChapter.value) return 0;
  const chapterDuration = currentChapter.value.end - currentChapter.value.start;
  if (chapterDuration <= 0) return 0;
  const elapsedInChapter = Math.max(0, state.currentTime - currentChapter.value.start);
  return Math.min(100, (elapsedInChapter / chapterDuration) * 100);
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
});

onUnmounted(() => {
  destroy();
});

const togglePlay = () => state.isPlaying ? pause() : play();

const skipToNextChapter = () => {
  if (currentChapterIndex.value === -1 || currentChapterIndex.value >= chapters.value.length - 1) return;
  const next = chapters.value[currentChapterIndex.value + 1];
  seek(next.start);
};

const skipToPrevChapter = () => {
  if (currentChapterIndex.value <= 0) {
    seek(0);
    return;
  }
  if (state.currentTime - (currentChapter.value?.start || 0) > 4) {
    seek(currentChapter.value!.start);
  } else {
    const prev = chapters.value[currentChapterIndex.value - 1];
    seek(prev.start);
  }
};

const handleChapterClick = (time: number) => {
  seek(time);
  showChapters.value = false;
};

const handleChapterProgressClick = (e: MouseEvent) => {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  
  if (currentChapter.value) {
    const chapterDur = currentChapter.value.end - currentChapter.value.start;
    seek(currentChapter.value.start + (ratio * chapterDur));
  } else {
    seek(ratio * state.duration);
  }
};

const handleSeriesClick = () => {
  if (metadata.value.seriesId) {
    emit('select-series', metadata.value.seriesId);
    showInfo.value = false;
  }
};

const onChaptersSaved = (updatedItem: ABSLibraryItem) => {
  emit('item-updated', updatedItem);
};

const metadata = computed(() => props.item?.media?.metadata || {});

const infoRows = computed(() => {
  const narratorValue = metadata.value.narratorName || 'Unknown Narrator';
  return [
    { label: 'Narrator', value: narratorValue, icon: Mic },
    { label: 'Series', value: metadata.value.seriesName || 'Standalone', icon: Layers, isClickable: !!metadata.value.seriesId },
    { label: 'Duration', value: secondsToTimestamp(state.duration), icon: Clock },
    { label: 'Publisher', value: metadata.value.publisher || 'Unknown', icon: Database },
    { label: 'Year', value: metadata.value.publishedYear || 'Unknown', icon: Clock }
  ];
});
</script>

<template>
  <div class="h-[100dvh] w-full bg-[#0d0d0d] text-white flex flex-col relative overflow-hidden font-sans select-none safe-top safe-bottom">
    <div class="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
      <div class="w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[160px] animate-pulse" />
    </div>

    <Transition name="fade">
      <div v-if="state.isLoading" class="absolute inset-0 bg-[#0d0d0d] flex flex-col items-center justify-center gap-6 z-[100]">
        <div class="w-12 h-12 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
        <p class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-600">Establishing Archive Stream...</p>
      </div>
    </Transition>

    <template v-if="!state.isLoading">
      <header class="px-8 py-8 flex justify-between items-center z-20 shrink-0">
        <button @click="emit('back')" class="p-2 text-neutral-600 hover:text-white transition-colors active:scale-90">
          <ChevronDown :size="24" stroke-width="1.5" />
        </button>
        <button @click="showChapters = true" class="flex flex-col items-center gap-1 group">
          <span class="text-[7px] font-black uppercase tracking-[0.5em] text-neutral-700 group-hover:text-purple-500 transition-colors">ARCHIVE INDEX</span>
          <div class="flex items-center gap-2 max-w-[200px]">
            <span class="text-[9px] font-black uppercase tracking-widest text-neutral-300 truncate">{{ currentChapter?.title || 'Segment 01' }}</span>
            <ChevronRight :size="10" class="text-neutral-700" />
          </div>
        </button>
        <button @click="showInfo = true" class="p-2 text-neutral-600 hover:text-white transition-colors">
          <Info :size="22" stroke-width="1.5" />
        </button>
      </header>

      <div class="flex-1 flex flex-col items-center justify-center px-8 relative gap-10">
        <div @click="showInfo = true" class="relative w-full max-w-[260px] aspect-square group cursor-pointer">
          <div class="absolute -inset-10 bg-purple-600/5 blur-[100px] rounded-full opacity-50" />
          <div class="relative z-10 w-full h-full rounded-[40px] overflow-hidden border border-white/10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] transition-transform duration-700 group-hover:scale-[1.02]">
            <img :src="coverUrl" class="w-full h-full object-cover" />
          </div>
        </div>
        <div class="text-center space-y-4 w-full max-w-md px-4 z-10">
          <div class="space-y-1">
            <p v-if="metadata.seriesName" class="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-500">
              {{ metadata.seriesName }} <span class="mx-1 text-purple-900">—</span> BOOK {{ metadata.sequence || '01' }}
            </p>
            <h1 class="text-lg md:text-xl font-black uppercase tracking-tight text-white leading-tight line-clamp-2">{{ metadata.title }}</h1>
            <p class="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-600">{{ metadata.authorName }}</p>
          </div>
          <div class="pt-2">
            <div class="text-3xl font-black font-mono-timer tabular-nums tracking-tighter text-white">{{ secondsToTimestamp(state.currentTime) }}</div>
            <p class="text-[8px] font-black text-neutral-800 uppercase tracking-widest mt-1">TOTAL ELAPSED</p>
          </div>
        </div>
      </div>

      <footer class="px-10 pb-16 space-y-12 max-w-xl mx-auto w-full z-20">
        <div class="space-y-4">
          <div class="h-1.5 w-full bg-neutral-900 rounded-full relative cursor-pointer overflow-hidden group" @click="handleChapterProgressClick">
            <div class="absolute inset-y-0 left-0 bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.5)] transition-all duration-150" :style="{ width: chapterProgressPercent + '%' }" />
          </div>
          <div class="flex justify-between items-center text-[8px] font-bold font-mono text-neutral-600 tracking-widest tabular-nums uppercase">
            <span>{{ secondsToTimestamp(state.currentTime - (currentChapter?.start || 0)) }}</span>
            <span class="text-purple-500/40 font-black">Segment Progress</span>
            <span>-{{ secondsToTimestamp(timeRemainingInChapter) }}</span>
          </div>
        </div>

        <div class="flex items-center justify-center gap-4 md:gap-8">
          <button @click="skipToPrevChapter" class="p-3 text-neutral-700 hover:text-purple-400 transition-colors active:scale-90"><SkipBack :size="20" /></button>
          <button @click="seek(state.currentTime - 10)" class="p-3 text-neutral-700 hover:text-white transition-colors active:scale-90"><RotateCcw :size="24" /></button>
          <button @click="togglePlay" class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center border border-purple-500/20 shadow-[0_0_50px_rgba(157,80,187,0.1)] active:scale-95 transition-all group relative">
            <Pause v-if="state.isPlaying" :size="32" class="text-purple-500 fill-current" />
            <Play v-else :size="32" class="text-purple-500 fill-current translate-x-1" />
          </button>
          <button @click="seek(state.currentTime + 30)" class="p-3 text-neutral-700 hover:text-white transition-colors active:scale-90"><RotateCw :size="24" /></button>
          <button @click="skipToNextChapter" class="p-3 text-neutral-700 hover:text-purple-400 transition-colors active:scale-90"><SkipForward :size="20" /></button>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="bg-neutral-900/20 border border-white/5 rounded-[24px] p-5 flex flex-col items-center gap-4">
            <div class="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] text-neutral-700"><Gauge :size="12" /><span>Speed</span></div>
            <div class="flex items-center justify-between w-full px-2">
              <button @click="setPlaybackRate(Math.max(0.5, state.playbackRate - 0.1))" class="p-1 text-neutral-600 hover:text-white"><Minus :size="14" /></button>
              <span class="text-xs font-black font-mono text-purple-500">{{ state.playbackRate.toFixed(1) }}x</span>
              <button @click="setPlaybackRate(Math.min(2.5, state.playbackRate + 0.1))" class="p-1 text-neutral-600 hover:text-white"><Plus :size="14" /></button>
            </div>
          </div>
          <div class="bg-neutral-900/20 border border-white/5 rounded-[24px] p-5 flex flex-col items-center gap-4">
            <div class="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] text-neutral-700"><Moon :size="12" /><span>Sleep</span></div>
            <div class="flex items-center justify-between w-full px-2">
              <button @click="state.sleepChapters = Math.max(0, state.sleepChapters - 1)" class="p-1 text-neutral-600 hover:text-white"><Minus :size="14" /></button>
              <div class="flex flex-col items-center">
                 <span v-if="state.sleepChapters > 0" class="text-[9px] font-black text-purple-500">{{ state.sleepChapters }} Ch left</span>
                 <span v-else class="text-xs font-black font-mono text-neutral-600">OFF</span>
              </div>
              <button @click="state.sleepChapters = Math.min(10, state.sleepChapters + 1)" class="p-1 text-neutral-600 hover:text-white"><Plus :size="14" /></button>
            </div>
          </div>
        </div>
      </footer>
    </template>

    <!-- Index Overlay -->
    <Transition name="slide-up">
      <div v-if="showChapters" class="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[150] flex flex-col">
        <header class="p-10 flex justify-between items-center bg-transparent shrink-0">
          <div class="space-y-1">
            <h2 class="text-xl font-black uppercase tracking-tighter text-white">ARCHIVE INDEX</h2>
            <p class="text-[8px] font-black uppercase tracking-[0.5em] text-purple-700">Captured Volume Segments</p>
          </div>
          <div class="flex items-center gap-4">
            <button @click="showChapterEditor = true" class="p-4 bg-purple-600/10 border border-purple-500/20 rounded-full text-purple-400 hover:text-white transition-all active:scale-90">
              <Edit3 :size="20"/>
            </button>
            <button @click="showChapters = false" class="p-4 bg-neutral-900/50 rounded-full text-neutral-500 hover:text-white border border-white/5 transition-all"><X :size="20"/></button>
          </div>
        </header>
        <div class="flex-1 overflow-y-auto p-8 no-scrollbar max-w-2xl mx-auto w-full pb-32">
          <button v-for="(ch, i) in chapters" :key="i" @click="handleChapterClick(ch.start)" class="w-full flex items-center justify-between p-6 rounded-[24px] mb-3 transition-all border border-transparent group text-left" :class="currentChapterIndex === i ? 'bg-purple-600/10 border-purple-500/20' : 'hover:bg-white/5'">
            <div class="flex flex-col gap-1">
              <span class="text-xs font-black uppercase tracking-tight" :class="currentChapterIndex === i ? 'text-white' : 'text-neutral-500'">{{ ch.title }}</span>
              <span class="text-[9px] font-mono text-neutral-700 tabular-nums">{{ secondsToTimestamp(ch.start) }}</span>
            </div>
          </button>
        </div>
      </div>
    </Transition>

    <!-- Info Overlay -->
    <Transition name="slide-up">
      <div v-if="showInfo" class="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[160] flex flex-col">
        <header class="p-10 flex justify-between items-center bg-transparent shrink-0">
          <div class="space-y-1">
            <h2 class="text-xl font-black uppercase tracking-tighter text-white">ARTIFACT DETAILS</h2>
            <p class="text-[8px] font-black uppercase tracking-[0.5em] text-purple-700">Registry Inventory Record</p>
          </div>
          <button @click="showInfo = false" class="p-4 bg-neutral-900/50 rounded-full text-neutral-500 hover:text-white border border-white/5 transition-all"><X :size="20"/></button>
        </header>
        <div class="flex-1 overflow-y-auto p-10 space-y-12 max-w-2xl mx-auto w-full no-scrollbar pb-32">
          <div class="space-y-4">
            <div class="flex items-center gap-2 text-neutral-700"><Book :size="14" /><span class="text-[9px] font-black uppercase tracking-[0.4em]">Artifact Summary</span></div>
            <h3 class="text-3xl font-black uppercase tracking-tighter text-white leading-tight">{{ metadata.title }}</h3>
            <p class="text-neutral-500 text-sm leading-relaxed">{{ metadata.description || 'No summary retrieved from repository.' }}</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-white/5 pt-12">
            <div v-for="row in infoRows" :key="row.label" class="flex flex-col gap-2">
              <div class="flex items-center gap-2 text-neutral-500"><component :is="row.icon" :size="12" /><span class="text-[9px] font-black uppercase tracking-[0.4em]">{{ row.label }}</span></div>
              <template v-if="row.isClickable"><button @click="handleSeriesClick" class="text-left text-sm font-bold text-white hover:text-purple-400 transition-colors cursor-pointer w-fit py-1 px-3 bg-purple-600/10 border border-purple-500/20 rounded-full active:scale-95">{{ row.value }}</button></template>
              <template v-else><span class="text-sm font-bold text-white">{{ row.value }}</span></template>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <ChapterEditor 
      v-if="showChapterEditor" 
      :item="item" 
      :auth="auth" 
      @close="showChapterEditor = false"
      @saved="onChaptersSaved"
    />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.4s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%); }
</style>
