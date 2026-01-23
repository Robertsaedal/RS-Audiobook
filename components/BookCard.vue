
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { Play, CheckCircle, Smartphone, Info, Heart, Loader2 } from 'lucide-vue-next';
import { OfflineManager } from '../services/offlineManager';
import { getDominantColor } from '../services/colorUtils';

const props = defineProps<{
  item: ABSLibraryItem,
  coverUrl: string,
  isSelected?: boolean,
  showMetadata?: boolean,
  fallbackSequence?: number | string | null,
  showProgress?: boolean,
  hideProgress?: boolean,
  downloadProgress?: number | null // NEW: Optional download progress (0-100)
}>();

const emit = defineEmits<{
  (e: 'click', item: ABSLibraryItem): void,
  (e: 'click-info', item: ABSLibraryItem): void
}>();

const imageReady = ref(false);
const isDownloaded = ref(false);
const isWishlisted = ref(false);
const localCover = ref<string | null>(null);
const triggerCompletionEffect = ref(false);
const showTimeRemaining = ref(false);
const accentColor = ref('#A855F7'); // Default Purple
const colorLoaded = ref(false);

const progressData = computed(() => {
  return props.item.userProgress || 
         (props.item.media as any)?.userProgress || 
         (props.item as any).userMediaProgress || 
         null;
});

const progressPercentage = computed(() => {
  const p = progressData.value;
  const media = props.item.media;

  if (p?.isFinished || (p as any)?.isCompleted) return 100;

  const totalDuration = media?.duration || p?.duration || 0;
  const currentTime = p?.currentTime || 0;

  if (totalDuration > 0 && currentTime > 0) {
    const calculatedPct = (currentTime / totalDuration) * 100;
    return Math.min(100, Math.max(0, calculatedPct));
  }

  if (typeof p?.progress === 'number' && p.progress > 0) {
    const serverPct = p.progress <= 1 ? p.progress * 100 : p.progress;
    return Math.min(100, Math.max(0, serverPct));
  }

  return 0;
});

const remainingTimeText = computed(() => {
  const p = progressData.value;
  const media = props.item.media;
  if (!p || !media) return '0m';
  
  const total = media.duration || p.duration || 0;
  const current = p.currentTime || 0;
  const left = Math.max(0, total - current);
  
  if (left <= 0) return '0m';

  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);

  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
});

const isFinished = computed(() => {
  const p = progressData.value;
  if (!p) return false;
  if (p.isFinished || (p as any).isCompleted) return true;
  return progressPercentage.value >= 99.5;
});

const displaySequence = computed(() => {
  // 1. Check direct override prop (often passed from SeriesView)
  if (props.fallbackSequence !== undefined && props.fallbackSequence !== null) {
    if (typeof props.fallbackSequence === 'string' && props.fallbackSequence.trim() === '') return null;
    return props.fallbackSequence;
  }
  const meta = props.item.media?.metadata;
  if (!meta) return null;
  // 2. Check seriesSequence explicitly
  if (meta.seriesSequence !== undefined && meta.seriesSequence !== null) return meta.seriesSequence;
  // 3. Check generic sequence
  if (meta.sequence !== undefined && meta.sequence !== null) return meta.sequence;
  // 4. Check array of series objects
  if (Array.isArray(meta.series) && meta.series.length > 0) {
    const s = meta.series[0];
    if (s.sequence !== undefined && s.sequence !== null) return s.sequence;
  }
  return null;
});

const handleImageLoad = async () => {
  imageReady.value = true;
  if (!colorLoaded.value) {
    const src = localCover.value || props.coverUrl;
    if (src) {
      colorLoaded.value = true;
      accentColor.value = await getDominantColor(src);
    }
  }
};

const toggleProgressDisplay = (e: Event) => {
  e.stopPropagation();
  showTimeRemaining.value = !showTimeRemaining.value;
};

const handleInfoClick = (e: Event) => {
  e.stopPropagation();
  emit('click-info', props.item);
};

watch(isFinished, (newVal) => {
  if (newVal) {
    triggerCompletionEffect.value = true;
    setTimeout(() => { triggerCompletionEffect.value = false; }, 2000);
  }
});

onMounted(async () => {
  // Debug log requested by user
  console.log('Book:', props.item.media.metadata.title, 'Sequence:', displaySequence.value, 'Full Meta:', props.item.media.metadata);

  if (await OfflineManager.isDownloaded(props.item.id)) {
    isDownloaded.value = true;
    localCover.value = await OfflineManager.getCoverUrl(props.item.id);
  }
  isWishlisted.value = await OfflineManager.isWishlisted(props.item.id);
});
</script>

<template>
  <button 
    @click="emit('click', item)"
    class="flex flex-col text-left group transition-all outline-none w-full relative h-full"
    :style="{ '--card-accent': accentColor }"
  >
    <!-- Cover Artifact Container -->
    <div 
      class="relative w-full aspect-[2/3] bg-neutral-950 rounded-xl overflow-hidden border transition-all duration-500 shadow-[0_10px_40px_-10px_var(--card-accent)] group-hover:scale-[1.04] shrink-0"
      :class="triggerCompletionEffect ? 'ring-2 ring-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.5)]' : ''"
      :style="{ borderColor: colorLoaded ? 'color-mix(in srgb, var(--card-accent) 40%, transparent)' : 'rgba(255,255,255,0.05)' }"
    >
      <!-- Completion Flash Effect -->
      <div v-if="triggerCompletionEffect" class="absolute inset-0 z-50 pointer-events-none bg-purple-500/20 mix-blend-overlay animate-pulse" />

      <!-- Shimmer Placeholder -->
      <div v-if="!imageReady" class="absolute inset-0 z-10 animate-shimmer" />

      <img 
        :src="localCover || coverUrl" 
        @load="handleImageLoad"
        class="w-full h-full object-cover transition-opacity duration-700" 
        :class="{ 'opacity-0': !imageReady, 'opacity-100': imageReady }"
        loading="lazy" 
      />

      <!-- DOWNLOADING OVERLAY -->
      <div v-if="downloadProgress !== undefined && downloadProgress !== null && downloadProgress >= 0" class="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center">
        <div class="relative w-12 h-12 flex items-center justify-center">
          <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <path class="text-neutral-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="4" />
            <path class="text-purple-500 transition-all duration-200" :stroke-dasharray="downloadProgress + ', 100'" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="4" />
          </svg>
          <span class="absolute text-[9px] font-black text-white">{{ Math.round(downloadProgress) }}%</span>
        </div>
        <span class="mt-2 text-[8px] font-black uppercase tracking-widest text-purple-300 animate-pulse">Syncing...</span>
      </div>
      
      <!-- Book Sequence Badge -->
      <div v-if="displaySequence !== null && !downloadProgress" class="absolute top-2 left-2 z-30">
        <div class="px-2 py-1 bg-black/70 backdrop-blur-md border border-white/10 rounded-md shadow-lg">
          <span class="text-[10px] font-black text-purple-400 tracking-tighter">
            #{{ displaySequence }}
          </span>
        </div>
      </div>
      
      <!-- Badges -->
      <div v-if="!downloadProgress" class="absolute top-2 right-2 z-30 flex flex-col items-end gap-1.5">
         <div 
           @click="handleInfoClick"
           class="flex items-center justify-center w-6 h-6 bg-black/60 backdrop-blur-md border border-white/10 rounded-full hover:bg-white hover:text-black transition-colors cursor-pointer shadow-lg"
         >
           <Info :size="12" />
         </div>
         <div v-if="isDownloaded" class="flex items-center justify-center w-6 h-6 bg-black/80 backdrop-blur-md border border-emerald-500/30 rounded-full shadow-xl">
           <Smartphone :size="10" class="text-emerald-500" />
         </div>
         <div v-if="isWishlisted && !isDownloaded" class="flex items-center justify-center w-6 h-6 bg-black/80 backdrop-blur-md border border-purple-500/30 rounded-full shadow-xl">
            <Heart :size="10" class="text-purple-400 fill-current" />
         </div>
      </div>

      <!-- Finished Indicator Overlay -->
      <div v-if="isFinished && !downloadProgress" class="absolute inset-0 flex items-center justify-center z-40 bg-black/40 backdrop-grayscale-[0.5] pointer-events-none">
         <div class="px-4 py-1.5 bg-purple-600/90 backdrop-blur-md border border-purple-400/30 rounded-full flex items-center justify-center shadow-xl transform -rotate-12">
            <span class="text-[9px] font-black text-white uppercase tracking-[0.2em]">COMPLETE</span>
         </div>
      </div>

      <!-- Play Overlay -->
      <div v-if="!isFinished && !downloadProgress" class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center pointer-events-none">
        <div class="w-14 h-14 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.5)] transform scale-90 group-hover:scale-100 transition-transform">
          <Play :size="24" fill="currentColor" class="translate-x-0.5" />
        </div>
      </div>

      <!-- Progress Bar (Hidden if downloading) -->
      <div v-if="!hideProgress && !isFinished && progressPercentage > 0 && !downloadProgress" class="absolute bottom-3 left-3 right-3 z-30 flex flex-col pointer-events-none">
         <div class="relative w-full h-1.5 bg-purple-950/40 backdrop-blur-sm rounded-full">
            <div 
              class="h-full bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all duration-300 relative" 
              :style="{ width: progressPercentage + '%', backgroundColor: colorLoaded ? 'var(--card-accent)' : undefined, boxShadow: colorLoaded ? '0 0 10px var(--card-accent)' : undefined }"
            />
         </div>
      </div>
    </div>
    
    <!-- Permanent Metadata Display -->
    <div v-if="showMetadata" class="mt-3 px-1 flex flex-col gap-1 w-full min-h-[3.5em]">
      <h3 
        class="text-[11px] font-black text-white uppercase tracking-tight leading-[1.3] transition-colors line-clamp-4 w-full break-words" 
        :title="item.media.metadata.title" 
        :style="{ color: colorLoaded ? 'color-mix(in srgb, var(--card-accent) 80%, white)' : undefined }"
      >
        {{ item.media.metadata.title }}
      </h3>
      <p class="text-[9px] font-black text-neutral-500 uppercase tracking-widest truncate w-full">
        {{ item.media.metadata.authorName }}
      </p>
    </div>
  </button>
</template>

<style scoped>
.line-clamp-4 {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
