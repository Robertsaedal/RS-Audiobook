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
  fallbackSequence?: number | string,
  showProgress?: boolean
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
  
  // If progress is explicit (0-1)
  if (p.progress !== undefined && p.progress !== null) {
    return p.progress * 100;
  }
  
  // Fallback calculation: currentTime / duration
  const current = p.currentTime || 0;
  const total = props.item.media.duration || p.duration || 1;
  return Math.min(100, (current / total) * 100);
});

const isFinished = computed(() => {
  const p = props.item.userProgress || (props.item as any).userMediaProgress;
  return p?.isFinished || progress.value >= 99;
});

const displaySequence = computed(() => {
  // 1. Try explicit fallback first (e.g. from Series view)
  if (props.fallbackSequence !== undefined && props.fallbackSequence !== null && props.fallbackSequence !== '') {
    return props.fallbackSequence;
  }
  
  const meta = props.item?.media?.metadata;
  // 2. Try metadata seriesSequence
  if (meta?.seriesSequence !== undefined && meta?.seriesSequence !== null) {
    return meta.seriesSequence;
  }
  // 3. Try metadata sequence
  return meta?.sequence || null;
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
        :class="{ 'opacity-0': !imageReady, 'opacity-100': imageReady, 'grayscale opacity-60': isFinished }"
        loading="lazy" 
      />
      
      <!-- Book Sequence Badge (Top Right Pill) - High Z-index -->
      <div v-if="displaySequence !== null" class="absolute top-2 right-2 bg-purple-600/95 backdrop-blur-md px-2 py-0.5 rounded-md flex items-center justify-center text-[10px] font-black text-white border border-white/20 shadow-xl z-[60] tracking-tight">
        #{{ displaySequence }}
      </div>
      
      <!-- Downloaded Badge (Top Left) -->
      <div v-if="isDownloaded" class="absolute top-2 left-2 z-30 text-purple-400 bg-black/60 rounded-full backdrop-blur-sm p-0.5 border border-white/10">
        <CheckCircle :size="14" fill="currentColor" class="text-white" />
      </div>

      <!-- Mark Finished Button (Top Left - Hover or if in progress) -->
      <div 
        v-if="!isFinished && (showProgress || progress > 0)" 
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

      <!-- Finished Indicator Overlay (Prominent) -->
      <div v-if="isFinished" class="absolute inset-0 flex items-center justify-center z-40 bg-black/40">
         <div class="px-3 py-1 bg-green-600/90 backdrop-blur-md border border-green-400/30 rounded-full flex items-center gap-2 shadow-xl transform -rotate-12">
            <Check :size="12" class="text-white" stroke-width="4" />
            <span class="text-[9px] font-black text-white uppercase tracking-widest">FINISHED</span>
         </div>
      </div>
      <div v-if="isFinished" class="absolute bottom-0 left-0 h-1.5 w-full bg-green-500 z-30 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />

      <!-- Play Overlay -->
      <div v-if="!isFinished" class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center pointer-events-none">
        <div class="w-14 h-14 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.5)] transform scale-90 group-hover:scale-100 transition-transform">
          <Play :size="24" fill="currentColor" class="translate-x-0.5" />
        </div>
      </div>

      <!-- Progress Bar (4px height) - Force show if showProgress is true even if calculated 0% -->
      <div v-if="(progress > 0 || showProgress) && !isFinished" class="absolute bottom-0 left-0 w-full z-30 bg-neutral-900/50">
         <div 
          class="h-1 bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]" 
          :style="{ width: Math.max(progress, showProgress && progress === 0 ? 2 : progress) + '%' }" 
        />
      </div>
      
      <!-- Percentage Text Overlay -->
      <div v-if="(progress > 0 || showProgress) && !isFinished" 
        class="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-2 py-1 rounded text-[9px] font-black text-white uppercase tracking-widest z-30 transition-opacity pointer-events-none border border-white/10"
        :class="showProgress ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      >
        {{ Math.round(progress) }}%
      </div>
    </div>
    
    <!-- Permanent Metadata Display -->
    <div v-if="showMetadata" class="mt-3 px-1 flex flex-col gap-1 w-full min-h-[3em]">
      <h3 class="text-[11px] font-black text-white uppercase tracking-tight leading-[1.2] group-hover:text-purple-400 transition-colors line-clamp-2 w-full break-words" :title="item.media.metadata.title">
        {{ item.media.metadata.title }}
      </h3>
      <p class="text-[9px] font-black text-neutral-500 uppercase tracking-widest truncate w-full">
        {{ item.media.metadata.authorName }}
      </p>
    </div>
  </button>
</template>

<style scoped>
/* Ensure line-clamp works properly */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>