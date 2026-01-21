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
  fallbackSequence?: number | string | null,
  showProgress?: boolean,
  hideProgress?: boolean
}>();

const emit = defineEmits<{
  (e: 'click', item: ABSLibraryItem): void,
  (e: 'finish', item: ABSLibraryItem): void
}>();

const imageReady = ref(false);
const isDownloaded = ref(false);
const localCover = ref<string | null>(null);

const progressData = computed(() => {
  // Handle both standard userProgress and the nested structure sometimes returned by search/series
  return props.item.userProgress || (props.item as any).userMediaProgress || null;
});

const progressPercentage = computed(() => {
  const p = progressData.value;
  
  // 1. If explicitly finished, return 100% immediately
  if (p?.isFinished) return 100;
  
  // 2. Calculate based on timestamps (Source of Truth for 0% bug)
  const currentTime = p?.currentTime || 0;
  const duration = p?.duration || props.item.media?.duration || 0;
  
  let calculatedPct = 0;
  if (duration > 0 && currentTime > 0) {
    calculatedPct = (currentTime / duration) * 100;
  }

  // 3. Get Server Progress
  const serverPct = (p?.progress || 0) * 100;

  // 4. Decision Logic:
  // If server says > 0, trust it (it handles floating point better). 
  // If server says 0 but we have calculated time, trust calculation.
  const finalPct = Math.max(serverPct, calculatedPct);
  
  return Math.min(100, Math.max(0, finalPct));
});

const isFinished = computed(() => {
  // Trust explicit flag, OR assume finished if > 97% complete (handles almost-finished states)
  return progressData.value?.isFinished || progressPercentage.value > 97;
});

const displaySequence = computed(() => {
  // 1. Explicit fallback passed from parent (SeriesView) - HIGHEST PRIORITY
  if (props.fallbackSequence !== undefined && props.fallbackSequence !== null && props.fallbackSequence !== '') {
    return props.fallbackSequence;
  }

  const meta = props.item.media?.metadata;
  
  // 2. Direct property on metadata
  let seq = meta?.seriesSequence ?? meta?.sequence;

  // 3. Nested series array (standard ABS item structure)
  // Sometimes the sequence is hidden inside the series array for the specific series
  if ((seq === undefined || seq === null) && Array.isArray((meta as any).series) && (meta as any).series.length > 0) {
    // If we can't identify which series, just take the first one
    const s = (meta as any).series[0];
    seq = s.sequence;
  }

  return (seq !== undefined && seq !== null && seq !== '') ? seq : null;
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
      
      <!-- Book Sequence Badge (Top Right Pill) -->
      <div v-if="displaySequence !== null" class="absolute top-2 right-2 bg-purple-600/95 backdrop-blur-md px-2 py-0.5 rounded-md flex items-center justify-center text-[10px] font-black text-white border border-white/20 shadow-xl z-[60] tracking-tight">
        #{{ displaySequence }}
      </div>
      
      <!-- Downloaded Badge (Top Left) -->
      <div v-if="isDownloaded" class="absolute top-2 left-2 z-30 text-purple-400 bg-black/60 rounded-full backdrop-blur-sm p-0.5 border border-white/10">
        <CheckCircle :size="14" fill="currentColor" class="text-white" />
      </div>

      <!-- Mark Finished Button (Visible on hover if not finished) -->
      <div 
        v-if="!isFinished && !hideProgress && (showProgress || progressPercentage > 0)" 
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

      <!-- Finished Indicator Overlay (Prominent - Overrides everything) -->
      <div v-if="isFinished" class="absolute inset-0 flex items-center justify-center z-40 bg-black/40 backdrop-grayscale-[0.5]">
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

      <!-- Progress Bar (4px height) -->
      <!-- HIDDEN if hideProgress is true OR item is finished -->
      <div v-if="!hideProgress && !isFinished && (progressPercentage > 0 || showProgress)" class="absolute bottom-0 left-0 w-full z-30 bg-neutral-900/50">
         <div 
          class="h-1 bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]" 
          :style="{ width: Math.max(progressPercentage, showProgress && progressPercentage === 0 ? 5 : progressPercentage) + '%' }" 
        />
      </div>
      
      <!-- Percentage Text Overlay -->
      <div v-if="!hideProgress && !isFinished && (progressPercentage > 0 || showProgress)" 
        class="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-2 py-1 rounded text-[9px] font-black text-white uppercase tracking-widest z-30 transition-opacity pointer-events-none border border-white/10"
        :class="showProgress ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      >
        {{ Math.round(progressPercentage) }}%
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
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>