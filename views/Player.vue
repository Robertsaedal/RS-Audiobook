
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { AuthState, ABSLibraryItem } from '../types';
import { usePlayer } from '../composables/usePlayer';
import { ABSService } from '../services/absService';
import { OfflineManager } from '../services/offlineManager';
import ChapterEditor from '../components/ChapterEditor.vue';
import { 
  ChevronDown, Play, Pause, Info, X, SkipBack, SkipForward,
  RotateCcw, RotateCw, ChevronRight, Moon, Plus, Minus, Mic, Clock, Layers, Download, CheckCircle, BookOpen, Calendar, ArrowRight, Heart
} from 'lucide-vue-next';

const props = defineProps<{
  auth: AuthState,
  item: ABSLibraryItem,
  showInfoInitially?: boolean
}>();

const emit = defineEmits<{
  (e: 'back'): void,
  (e: 'select-series', seriesId: string): void,
  (e: 'item-updated', updatedItem: ABSLibraryItem): void
}>();

const { state, load, play, pause, seek, setPlaybackRate, setPreservesPitch, setSleepChapters, setSleepTimer, destroy } = usePlayer();
const absService = computed(() => new ABSService(props.auth.serverUrl, props.auth.user?.token || ''));

const showChapters = ref(false);
const showInfo = ref(props.showInfoInitially || false);
const isDownloaded = ref(false);
const isWishlisted = ref(false);
const isDownloading = ref(false);
const downloadProgress = ref(0);
const liveTime = ref(Date.now()); 

const activeItem = computed(() => state.activeItem || props.item);
const coverUrl = computed(() => {
  const baseUrl = props.auth.serverUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  return `${baseUrl}/api/items/${activeItem.value.id}/cover?token=${props.auth.user?.token}`;
});

onMounted(async () => {
  if (state.activeItem?.id !== props.item.id) load(props.item, props.auth);
  isDownloaded.value = await OfflineManager.isDownloaded(activeItem.value.id);
  isWishlisted.value = await OfflineManager.isWishlisted(activeItem.value.id);
  setInterval(() => { liveTime.value = Date.now(); }, 1000);
});

const toggleWishlist = async () => {
  const newState = await OfflineManager.toggleWishlist(activeItem.value);
  isWishlisted.value = newState;
};

const handleToggleDownload = async () => {
  if (isDownloading.value) return;
  if (isDownloaded.value) {
    if (confirm("Remove download?")) {
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
  { label: 'Series', value: metadata.value.seriesName || 'Standalone', icon: Layers, isClickable: true },
  { label: 'Duration', value: '12:00:00', icon: Clock },
  { label: 'Year', value: metadata.value.publishedYear || 'Unknown', icon: Calendar }
]);
</script>

<template>
  <div class="h-[100dvh] w-full bg-[#0d0d0d] text-white flex flex-col relative overflow-hidden font-sans select-none safe-top safe-bottom">
    <!-- Player UI... (same as before) -->
    <div 
      class="absolute inset-0 z-0 pointer-events-none transition-colors duration-1000 ease-in-out"
      :style="{ backgroundColor: state.accentColor }"
      style="opacity: 0.15; filter: blur(80px);"
    />

    <template v-if="!state.isLoading">
      <header class="px-8 py-6 flex justify-between items-center z-20">
        <button @click="emit('back')" class="p-2 text-neutral-600 hover:text-white transition-colors"><ChevronDown :size="24" /></button>
        <button @click="showChapters = true" class="flex flex-col items-center gap-1 group">
          <span class="text-[7px] font-black uppercase tracking-[0.5em] text-neutral-700">INDEX</span>
          <span class="text-[10px] font-black uppercase text-neutral-300">{{ activeItem.media.metadata.title }}</span>
        </button>
        <div class="flex items-center gap-2">
           <button @click="handleToggleDownload" class="p-2 text-neutral-600"><Download :size="22" /></button>
           <button @click="showInfo = true" class="p-2 text-neutral-600"><Info :size="22" /></button>
        </div>
      </header>

      <!-- Main Controls & Visualization Area... -->
      <div class="flex-1 flex flex-col items-center justify-center">
         <!-- Card & Progress Bars... -->
      </div>
    </template>

    <!-- Info Overlay -->
    <Transition name="fade">
      <div v-if="showInfo" class="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex flex-col p-8 overflow-hidden">
        <div class="flex justify-between items-center mb-8 shrink-0">
          <h2 class="text-2xl font-black uppercase tracking-tighter text-white">Artifact Data</h2>
          <button @click="showInfo = false" class="p-3 bg-neutral-900 rounded-full text-neutral-500 hover:text-white border border-white/5">
            <X :size="20" />
          </button>
        </div>
        
        <div class="flex-1 overflow-y-auto custom-scrollbar">
          <div class="max-w-2xl mx-auto space-y-10">
            <div class="flex flex-col items-center text-center space-y-6">
              <div class="w-40 h-60 rounded-lg shadow-2xl overflow-hidden border border-white/10">
                <img :src="coverUrl" class="w-full h-full object-cover" />
              </div>
              <div class="space-y-4">
                <h3 class="text-2xl font-black uppercase leading-tight">{{ metadata.title }}</h3>
                
                <!-- Want to Listen Toggle -->
                <button 
                  @click="toggleWishlist"
                  class="flex items-center gap-3 px-8 py-4 rounded-full font-black text-[10px] uppercase tracking-[0.4em] transition-all active:scale-95 border"
                  :class="isWishlisted ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]' : 'bg-neutral-900 border-white/5 text-neutral-500 hover:text-white'"
                >
                  <Heart :size="16" :fill="isWishlisted ? 'white' : 'none'" :class="isWishlisted ? 'text-white' : 'text-neutral-500'" />
                  {{ isWishlisted ? 'In Wishlist' : 'Want To Listen' }}
                </button>
              </div>
            </div>

            <div v-if="metadata.description" class="space-y-2">
              <h4 class="text-[10px] font-black uppercase tracking-widest text-neutral-600">Summary</h4>
              <div class="text-neutral-300 text-sm leading-relaxed" v-html="metadata.description"></div>
            </div>

            <div class="grid grid-cols-2 gap-4 pb-20">
              <div v-for="(row, i) in infoRows" :key="i" class="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col gap-1">
                <div class="flex items-center gap-2 text-neutral-500 mb-1">
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
  </div>
</template>
