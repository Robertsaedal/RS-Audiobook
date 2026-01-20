<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ABSLibraryItem } from '../types';
import { Play, CheckCircle, Check } from 'lucide-vue-next';
import { OfflineManager } from '../services/offlineManager';

const props = defineProps<{
  item: ABSLibraryItem,
  coverUrl: string,
  isSelected?: boolean,
  showMetadata?: boolean,
  fallbackSequence?: number | string
}>();

const emit = defineEmits<{
  (e: 'click', item: ABSLibraryItem): void,
  (e: 'finish', item: ABSLibraryItem): void
}>();

const imageReady = ref(false);
const isDownloaded = ref(false);
const localCover = ref<string | null>(null);

const progress = computed(() => {
  // Support both standard userProgress and userMediaProgress (common in shelves)
  const p = props.item.userProgress || (props.item as any).userMediaProgress;
  
  if (!p) return 0;
  
  if (p.progress !== undefined) {
    return p.progress * 100;
  }
  
  const current = p.currentTime || 0;
  const total = props.item.media.duration || p.duration || 1;
  return Math.min(100, (current / total) * 100);
});

const isFinished = computed(() => {
  const p = props.item.userProgress || (props.item as any).userMediaProgress;
  return p?.isFinished || false;
});

const displaySequence = computed(() => {
  // Prioritize seriesSequence from API, then sequence, then UI fallback
  // Ensure we check for 0 or string '0'
  const meta = props.item?.media?.metadata;
  let raw = meta?.seriesSequence;
  
  if (raw === undefined || raw === null) {
    raw = meta?.sequence;
  }
  if (raw === undefined || raw === null) {
    raw = props.fallbackSequence;
  }
  
  if (raw === undefined || raw === null || raw === '') return null;
  return raw;
});

const handleImageLoad = () => {
  imageReady.value = true;
};

const handleMarkFinished = (e: Event) => {
  e.stopPropagation();
  emit('finish', props.item);
};

onMounted(async () => {
  if (await OfflineManager.isDownloaded(props.item.id)) {
    isDownloaded.value = true;
    localCover.value = await OfflineManager.getCoverUrl(props.item.id);
  }
});
</script>

<template>
  <button 
    @click="emit('click', item)"
    class="flex flex-col text-left group transition-all outline-none w-full relative"
  >
    <!-- Cover Artifact Container -->
    <div 
      class="relative w-full aspect-[2/3] bg-neutral-950 rounded-xl overflow-hidden border border-white/5 transition-all duration-500 group-hover:scale-[1.04] shadow-2xl group-hover:shadow-purple-500/10"
    >
      <!-- Shimmer Placeholder -->
      <div v-if="!imageReady" class="absolute inset-0 z-10 animate-shimmer" />

      <img 
        :src="localCover || coverUrl" 
        @load="handleImageLoad"
        class="w-full h-full object-cover transition-opacity duration-700" 
        :class="{ 'opacity-0': !imageReady, 'opacity-100': imageReady }"
        loading="lazy" 
      />
      
      <!-- Book Sequence Badge (Top Right Pill) -->
      <div v-if="displaySequence !== null" class="absolute top-2 right-2 bg-purple-600/90 backdrop-blur-md px-2 py-0.5 rounded-md flex items-center justify-center text-[10px] font-black text-white border border-white/20 shadow-xl z-50 tracking-tight">
        #{{ displaySequence }}
      </div>
      
      <!-- Downloaded Badge (Top Left) -->
      <div v-if="isDownloaded" class="absolute top-2 left-2 z-30 text-purple-400 bg-black/60 rounded-full backdrop-blur-sm p-0.5 border border-white/10">
        <CheckCircle :size="14" fill="currentColor" class="text-white" />
      </div>

      <!-- Mark Finished Button (Top Left - Hover or if in progress) -->
      <div 
        v-if="!isFinished && progress > 0" 
        class="absolute top-2 left-2 z-40 opacity-0 group-hover:opacity-100 transition-opacity"
        :class="{ 'left-8': isDownloaded }"
      >
        <button 
          @click="handleMarkFinished"
          class="p-1.5 bg-black/60 hover:bg-green-600 rounded-full backdrop-blur-sm border border-white/20 hover:border-green-400 text-white transition-all shadow-lg active:scale-90"
          title="Mark as Finished"
        >
          <Check :size="14" />
        </button>
      </div>

      <!-- Play Overlay -->
      <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center pointer-events-none">
        <div class="w-14 h-14 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.5)] transform scale-90 group-hover:scale-100 transition-transform">
          <Play :size="24" fill="currentColor" class="translate-x-0.5" />
        </div>
      </div>

      <!-- High-Contrast Progress Bar (Bottom Edge) -->
      <div v-if="progress > 0 && !isFinished" class="absolute bottom-0 left-0 h-1.5 w-full bg-neutral-900/80 z-30">
        <div 
          class="h-full bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.8)] transition-all duration-300" 
          :style="{ width: progress + '%' }" 
        />
      </div>
      <!-- Finished Indicator -->
      <div v-if="isFinished" class="absolute bottom-0 left-0 h-1 w-full bg-green-500 z-30 shadow-[0_0_10px_rgba(34,197,94,0.3)]" />
      
      <!-- Percentage Text Overlay (Visible on hover when in progress) -->
      <div v-if="progress > 0 && !isFinished" class="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-2 py-1 rounded text-[9px] font-black text-white uppercase tracking-widest z-30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10">
        {{ Math.round(progress) }}%
      </div>
    </div>
    
    <!-- Permanent Metadata Display -->
    <div v-if="showMetadata" class="mt-3 px-1 space-y-1">
      <h3 class="text-[11px] font-black text-white uppercase tracking-tight leading-[1.2] h-[2.4em] group-hover:text-purple-400 transition-colors line-clamp-2 overflow-hidden">
        {{ item.media.metadata.title }}
      </h3>
      <p class="text-[9px] font-black text-neutral-500 uppercase tracking-widest truncate">
        {{ item.media.metadata.authorName }}
      </p>
    </div>
  </button>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>