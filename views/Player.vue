
<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { AuthState, ABSLibraryItem } from '../types';
import { usePlayer } from '../composables/usePlayer';
import { ABSService } from '../services/absService';
import { OfflineManager } from '../services/offlineManager';
import ChapterEditor from '../components/ChapterEditor.vue';
import { 
  ChevronDown, Play, Pause, Info, X, SkipBack, SkipForward,
  RotateCcw, RotateCw, Moon, Plus, Minus, Mic, Clock, Layers, Download, Calendar, Heart
} from 'lucide-vue-next';

const props = defineProps<{
  auth: AuthState,
  item: ABSLibraryItem,
  showInfoInitially?: boolean
}>();

const emit = defineEmits<{
  (e: 'back'): void,
  (e: 'select-series', seriesId: string): void
}>();

const { state, load, play, pause, seek, setPlaybackRate, setPreservesPitch, setSleepChapters, setSleepTimer, destroy } = usePlayer();
const absService = computed(() => new ABSService(props.auth.serverUrl, props.auth.user?.token || ''));

const showChapters = ref(false);
const showInfo = ref(props.showInfoInitially || false);
const isDownloaded = ref(false);
const isWishlisted = ref(false);
const isDownloading = ref(false);
const downloadProgress = ref(0);

const activeItem = computed(() => state.activeItem || props.item);
const coverUrl = computed(() => {
  const baseUrl = props.auth.serverUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  return `${baseUrl}/api/items/${activeItem.value.id}/cover?token=${props.auth.user?.token}`;
});

const progressPercent = computed(() => {
  if (!state.duration) return 0;
  return (state.currentTime / state.duration) * 100;
});

const currentChapter = computed(() => {
  const chapters = activeItem.value?.media?.chapters || [];
  const time = state.currentTime + 0.1;
  return chapters.find((ch, i) => 
    time >= ch.start && (i === chapters.length - 1 || time < (chapters[i+1]?.start || ch.end))
  );
});

const chapterProgressPercent = computed(() => {
  const ch = currentChapter.value;
  if (!ch) return 0;
  const chDuration = ch.end - ch.start;
  if (chDuration <= 0) return 0;
  return ((state.currentTime - ch.start) / chDuration) * 100;
});

const secondsToTimestamp = (s: number) => {
  if (isNaN(s) || s < 0) return "00:00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

onMounted(async () => {
  if (state.activeItem?.id !== props.item.id) load(props.item, props.auth);
  isDownloaded.value = await OfflineManager.isDownloaded(activeItem.value.id);
  isWishlisted.value = await OfflineManager.isWishlisted(activeItem.value.id);
});

const toggleWishlist = async () => {
  const newState = await OfflineManager.toggleWishlist(activeItem.value);
  isWishlisted.value = newState;
};

const handleToggleDownload = async () => {
  if (isDownloading.value) return;
  if (isDownloaded.value) {
    if (confirm("Remove download from local storage?")) {
      await OfflineManager.removeBook(activeItem.value.id);
      isDownloaded.value = false;
    }
  } else {
    isDownloading.value = true;
    try {
      await OfflineManager.saveBook(absService.value, activeItem.value, (pct) => downloadProgress.value = pct);
      isDownloaded.value = true;
    } catch (e) { alert("Download failed."); } finally { isDownloading.value = false; }
  }
};

const metadata = computed(() => activeItem.value?.media?.metadata || {});
const infoRows = computed(() => [
  { label: 'Narrator', value: metadata.value.narratorName || 'Unknown', icon: Mic },
  { label: 'Series', value: metadata.value.seriesName || 'Standalone', icon: Layers },
  { label: 'Published', value: metadata.value.publishedYear || 'Unknown', icon: Calendar }
]);
</script>

<template>
  <div class="h-[100dvh] w-full bg-[#0d0d0d] text-white flex flex-col relative overflow-hidden font-sans select-none safe-top safe-bottom">
    <!-- Background Glow -->
    <div 
      class="absolute inset-0 z-0 pointer-events-none transition-colors duration-1000 ease-in-out"
      :style="{ backgroundColor: state.accentColor, opacity: 0.15, filter: 'blur(80px)' }"
    />

    <template v-if="state.isLoading">
       <div class="flex-1 flex flex-col items-center justify-center gap-6">
          <div class="w-16 h-16 border-4 border-t-purple-600 rounded-full animate-spin" />
          <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-600">Initializing Link...</p>
       </div>
    </template>

    <template v-else>
      <header class="px-8 py-6 flex justify-between items-center z-20 shrink-0">
        <button @click="emit('back')" class="p-2 text-neutral-600 hover:text-white transition-colors"><ChevronDown :size="24" /></button>
        <div class="flex flex-col items-center">
          <span class="text-[7px] font-black uppercase tracking-[0.5em] text-neutral-700 mb-1">NOW PLAYING</span>
          <h1 class="text-[10px] font-black uppercase text-white tracking-widest text-center truncate max-w-[200px]">{{ metadata.title }}</h1>
        </div>
        <div class="flex items-center gap-2">
          <button @click="handleToggleDownload" class="p-2 text-neutral-600" :class="{ 'text-emerald-500': isDownloaded, 'animate-pulse': isDownloading }">
             <Download :size="20" />
          </button>
          <button @click="showInfo = true" class="p-2 text-neutral-600"><Info :size="20" /></button>
        </div>
      </header>

      <main class="flex-1 flex flex-col items-center justify-center px-8 z-10 overflow-hidden">
        <!-- Artifact Visualization -->
        <div class="relative group mb-12 shrink-0">
           <div class="w-56 md:w-64 aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] border border-white/10 relative">
             <img :src="coverUrl" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[5s]" />
             <div class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
           </div>
           <!-- Float Glow -->
           <div class="absolute inset-0 -z-10 blur-[60px] opacity-40 rounded-full" :style="{ backgroundColor: state.accentColor }" />
        </div>

        <!-- Meta -->
        <div class="text-center space-y-2 mb-10 w-full px-4">
           <h2 class="text-xl md:text-2xl font-black uppercase tracking-tight leading-tight line-clamp-2">{{ metadata.title }}</h2>
           <p class="text-[10px] font-black uppercase tracking-[0.3em] text-purple-400">{{ metadata.authorName }}</p>
        </div>

        <!-- Progress Controllers -->
        <div class="w-full max-w-md space-y-8 mb-10">
           <!-- Chapter Progress -->
           <div class="space-y-3">
              <div class="flex justify-between items-end px-1">
                 <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500 truncate max-w-[70%]">
                    {{ currentChapter?.title || 'Archive Index' }}
                 </span>
                 <span class="text-[10px] font-bold font-mono text-purple-400">
                    {{ secondsToTimestamp(state.currentTime - (currentChapter?.start || 0)) }}
                 </span>
              </div>
              <div class="relative h-1.5 w-full bg-neutral-900 rounded-full overflow-hidden border border-white/5">
                 <div class="h-full bg-purple-600 rounded-full transition-all duration-300" :style="{ width: chapterProgressPercent + '%' }" />
              </div>
           </div>

           <!-- Total Progress -->
           <div class="space-y-3">
              <div class="relative h-1 w-full bg-neutral-900/50 rounded-full overflow-hidden">
                 <div class="h-full bg-white/20 rounded-full transition-all duration-300" :style="{ width: progressPercent + '%' }" />
              </div>
              <div class="flex justify-between items-center px-1 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-700">
                 <span>{{ secondsToTimestamp(state.currentTime) }}</span>
                 <span>-{{ secondsToTimestamp(state.duration - state.currentTime) }}</span>
              </div>
           </div>
        </div>

        <!-- Primary Controls -->
        <div class="flex items-center justify-center gap-8 md:gap-12 mb-12">
           <button @click="seek(state.currentTime - 15)" class="p-4 text-neutral-400 hover:text-white transition-colors"><RotateCcw :size="28" /></button>
           <button @click="state.isPlaying ? pause() : play()" class="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center shadow-2xl active:scale-90 transition-all">
              <Pause v-if="state.isPlaying" :size="32" fill="currentColor" />
              <Play v-else :size="32" fill="currentColor" class="translate-x-1" />
           </button>
           <button @click="seek(state.currentTime + 30)" class="p-4 text-neutral-400 hover:text-white transition-colors"><RotateCw :size="28" /></button>
        </div>

        <!-- Secondary Sub-Controls -->
        <div class="w-full max-w-md flex items-center justify-between px-6 mb-8 text-neutral-500">
           <button @click="showChapters = true" class="flex flex-col items-center gap-1 group">
              <Layers :size="20" class="group-hover:text-purple-400" />
              <span class="text-[7px] font-black uppercase tracking-widest">Chapters</span>
           </button>
           
           <div class="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-full border border-white/10">
              <button @click="setPlaybackRate(Math.max(0.5, state.playbackRate - 0.1))" class="hover:text-white transition-colors"><Minus :size="14" /></button>
              <span class="text-[10px] font-black font-mono text-white w-8 text-center">{{ state.playbackRate.toFixed(1) }}x</span>
              <button @click="setPlaybackRate(Math.min(3, state.playbackRate + 0.1))" class="hover:text-white transition-colors"><Plus :size="14" /></button>
           </div>

           <button @click="setSleepTimer(state.sleepEndTime ? 0 : 30 * 60)" class="flex flex-col items-center gap-1 group" :class="{ 'text-purple-500': state.sleepEndTime }">
              <Moon :size="20" class="group-hover:text-purple-400" />
              <span class="text-[7px] font-black uppercase tracking-widest">{{ state.sleepEndTime ? 'Active' : 'Sleep' }}</span>
           </button>
        </div>
      </main>

      <!-- Chapter Index Sheet -->
      <ChapterEditor v-if="showChapters" :item="activeItem" :currentTime="state.currentTime" :isPlaying="state.isPlaying" @close="showChapters = false" @seek="seek" />

      <!-- Info Modal -->
      <Transition name="fade">
        <div v-if="showInfo" class="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex flex-col p-8 overflow-hidden">
          <div class="flex justify-between items-center mb-8 shrink-0">
            <h2 class="text-2xl font-black uppercase tracking-tighter text-white">Registry Metadata</h2>
            <button @click="showInfo = false" class="p-3 bg-neutral-900 rounded-full text-neutral-500 hover:text-white border border-white/5">
              <X :size="20" />
            </button>
          </div>
          
          <div class="flex-1 overflow-y-auto custom-scrollbar">
            <div class="max-w-2xl mx-auto space-y-12">
              <div class="flex flex-col items-center text-center space-y-6">
                <div class="w-44 h-64 rounded-xl shadow-2xl overflow-hidden border border-white/10">
                  <img :src="coverUrl" class="w-full h-full object-cover" />
                </div>
                <div class="space-y-4">
                  <h3 class="text-2xl font-black uppercase tracking-tight leading-tight">{{ metadata.title }}</h3>
                  <button @click="toggleWishlist" class="flex items-center gap-3 px-8 py-4 rounded-full font-black text-[10px] uppercase tracking-[0.4em] transition-all active:scale-95 border" :class="isWishlisted ? 'bg-purple-600 border-purple-400 text-white shadow-xl' : 'bg-neutral-900 border-white/5 text-neutral-500 hover:text-white'">
                    <Heart :size="16" :fill="isWishlisted ? 'white' : 'none'" />
                    {{ isWishlisted ? 'In Wishlist' : 'Flag for Collection' }}
                  </button>
                </div>
              </div>

              <div v-if="metadata.description" class="space-y-3">
                <h4 class="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600">Archive Summary</h4>
                <div class="text-neutral-400 text-sm leading-relaxed" v-html="metadata.description"></div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-20">
                <div v-for="(row, i) in infoRows" :key="i" class="bg-white/5 border border-white/5 p-5 rounded-2xl flex flex-col gap-1">
                  <div class="flex items-center gap-2 text-neutral-500 mb-2">
                    <component :is="row.icon" :size="12" />
                    <span class="text-[9px] font-black uppercase tracking-widest">{{ row.label }}</span>
                  </div>
                  <span class="text-sm font-bold text-white truncate">{{ row.value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.perspective-1000 { perspective: 1000px; }
</style>
