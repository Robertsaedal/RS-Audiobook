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
  // Check root userProgress, then userMediaProgress, then media.userProgress (API variation coverage)
  return props.item.userProgress || 
         (props.item as any).userMediaProgress || 
         (props.item.media as any)?.userProgress || 
         null;
});

const progressPercentage = computed(() => {
  const p = progressData.value;
  if (!p) return 0;
  
  // 1. Explicitly Finished
  if (p.isFinished) return 100;

  // 2. Server Progress (Handle Decimal 0.5 vs Percent 50 vs 1.0)
  let pct = 0;
  if (typeof p.progress === 'number' && p.progress > 0) {
    pct = p.progress <= 1 ? p.progress * 100 : p.progress;
  }

  // 3. Fallback Calculation 
  const duration = p.duration || props.item.media?.duration || 0;
  const currentTime = p.currentTime || 0;

  if ((!pct || pct < 1) && currentTime > 0 && duration > 0) {
    pct = (currentTime / duration) * 100;
  }

  return Math.min(100, Math.max(0, pct));
});

const isFinished = computed(() => {
  const p = progressData.value;
  if (!p) return false;
  
  // Robust check: explicit flag OR progress is 100% OR progress is 1.0
  if (p.isFinished) return true;
  if (p.progress === 1 || p.progress === 100) return true;
  
  return progressPercentage.value > 97;
});

const displaySequence = computed(() => {
  // 1. Explicit fallback passed from parent (SeriesView)
  if (props.fallbackSequence !== undefined && props.fallbackSequence !== null && props.fallbackSequence !== '') {
    return props.fallbackSequence;
  }

  const meta = props.item.media?.metadata;
  
  // 2. Direct property on metadata
  let seq = meta?.seriesSequence ?? meta?.sequence;

  // 3. Check root level sequence (Series View Item structure)
  if ((seq === undefined || seq === null) && (props.item as any).sequence !== undefined) {
    seq = (props.item as any).sequence;
  }

  // 4. Nested series array (standard ABS item structure)
  if ((seq === undefined || seq === null) && Array.isArray((meta as any).series) && (meta as any).series.length > 0) {
    const s = (meta as any).series[0];
    seq = s.sequence;
  }

  // Allow 0 as a valid sequence (prequels)
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
      
      <!-- Book Sequence Badge (Supports 0) -->
      <div v-if="displaySequence !== null" class="absolute top-2 left-2 bg-neutral-900/90 backdrop-blur-md px-2 py-0.5 rounded-md flex items-center justify-center text-[10px] font-black text-white border border-white/10 shadow-xl z-[60] tracking-tight">
        #{{ displaySequence }}
      </div>
      
      <!-- Finished Checkmark -->
      <div v-if="isFinished" class="absolute top-2 right-2 bg-purple-600 rounded-full p-1 shadow-lg z-50 border border-black/20">
        <CheckCircle :size="14" class="text-white" fill="currentColor" stroke="white" />
      </div>

      <!-- Downloaded Badge -->
      <div v-if="isDownloaded && !isFinished" class="absolute top-2 right-2 z-30 text-purple-400 bg-black/60 rounded-full backdrop-blur-sm p-0.5 border border-white/10">
        <CheckCircle :size="14" fill="currentColor" class="text-white" />
      </div>
      <div v-if="isDownloaded && isFinished" class="absolute top-2 right-8 z-30 text-neutral-400 bg-black/60 rounded-full backdrop-blur-sm p-0.5 border border-white/10">
        <Check :size="12" />
      </div>

      <!-- Mark Finished Button (Hover) -->
      <div 
        v-if="!isFinished && !hideProgress && (showProgress || progressPercentage > 0)" 
        class="absolute bottom-12 right-2 z-40 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <button 
          @click="handleMarkFinished"
          class="p-1.5 bg-black/60 hover:bg-green-600 rounded-full backdrop-blur-sm border border-white/20 hover:border-green-400 text-white transition-all shadow-lg active:scale-90"
          title="Mark as Finished"
        >
          <Check :size="14" />
        </button>
      </div>

      <!-- Finished Indicator Overlay -->
      <div v-if="isFinished" class="absolute inset-0 flex items-center justify-center z-40 bg-black/40 backdrop-grayscale-[0.5] pointer-events-none">
         <div class="px-3 py-1 bg-purple-600/90 backdrop-blur-md border border-purple-400/30 rounded-full flex items-center gap-2 shadow-xl transform -rotate-12">
            <Check :size="12" class="text-white" stroke-width="4" />
            <span class="text-[9px] font-black text-white uppercase tracking-widest">COMPLETE</span>
         </div>
      </div>
      <div v-if="isFinished" class="absolute bottom-0 left-0 h-1.5 w-full bg-purple-500 z-30 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />

      <!-- Play Overlay -->
      <div v-if="!isFinished" class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center pointer-events-none">
        <div class="w-14 h-14 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.5)] transform scale-90 group-hover:scale-100 transition-transform">
          <Play :size="24" fill="currentColor" class="translate-x-0.5" />
        </div>
      </div>

      <!-- Progress Bar -->
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