<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { Play, CheckCircle, Check } from 'lucide-vue-next';
import { OfflineManager } from '../services/offlineManager';
import { getDominantColor } from '../services/colorUtils';

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
  (e: 'click', item: ABSLibraryItem): void
}>();

const imageReady = ref(false);
const isDownloaded = ref(false);
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
  return progressPercentage.value > 97;
});

const displaySequence = computed(() => {
  if (props.fallbackSequence !== undefined && props.fallbackSequence !== null) {
    if (typeof props.fallbackSequence === 'string' && props.fallbackSequence.trim() === '') return null;
    return props.fallbackSequence;
  }

  const meta = props.item.media?.metadata;
  if (!meta) return null;
  
  if (meta.seriesSequence !== undefined && meta.seriesSequence !== null) return meta.seriesSequence;
  if (meta.sequence !== undefined && meta.sequence !== null) return meta.sequence;

  if ((props.item as any).sequence !== undefined && (props.item as any).sequence !== null) {
    return (props.item as any).sequence;
  }

  if (Array.isArray(meta.series) && meta.series.length > 0) {
    const s = meta.series[0];
    if (s.sequence !== undefined && s.sequence !== null) return s.sequence;
  }

  if (meta.seriesName && typeof meta.seriesName === 'string') {
    const match = meta.seriesName.match(/#\s*([0-9]+(?:\.[0-9]+)?)(?:\s|$)/);
    if (match) return match[1];
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

// Watch for real-time completion to trigger visual feedback
watch(isFinished, (newVal) => {
  if (newVal) {
    triggerCompletionEffect.value = true;
    setTimeout(() => { triggerCompletionEffect.value = false; }, 2000);
  }
});

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
    :style="{ '--card-accent': accentColor }"
  >
    <!-- Cover Artifact Container -->
    <div 
      class="relative w-full aspect-[2/3] bg-neutral-950 rounded-xl overflow-hidden border transition-all duration-500 shadow-[0_10px_40px_-10px_var(--card-accent)] group-hover:scale-[1.04]"
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
      
      <!-- Book Sequence Badge -->
      <div v-if="displaySequence !== null" class="absolute top-2 left-2 z-30">
        <div class="px-2 py-1 bg-black/70 backdrop-blur-md border border-white/10 rounded-md shadow-lg">
          <span class="text-[10px] font-black text-purple-400 tracking-tighter">
            #{{ displaySequence }}
          </span>
        </div>
      </div>
      
      <!-- Downloaded Badge -->
      <div v-if="isDownloaded && !isFinished" class="absolute top-2 right-2 z-30 text-purple-400 bg-black/60 rounded-full backdrop-blur-sm p-0.5 border border-white/10">
        <CheckCircle :size="14" fill="currentColor" class="text-white" />
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

      <!-- Amethyst Glow Floating Progress -->
      <div v-if="!hideProgress && !isFinished && Math.round(progressPercentage) > 0" class="absolute bottom-3 left-3 right-3 z-30 flex flex-col pointer-events-none">
         
         <!-- Progress Track -->
         <div class="relative w-full h-1.5 bg-purple-950/40 backdrop-blur-sm rounded-full">
            <!-- Fill -->
            <div 
              class="h-full bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all duration-300 relative" 
              :style="{ width: progressPercentage + '%', backgroundColor: colorLoaded ? 'var(--card-accent)' : undefined, boxShadow: colorLoaded ? '0 0 10px var(--card-accent)' : undefined }"
            />

            <!-- Floating Pill (Anchored to Percentage) -->
            <div 
               class="absolute bottom-full mb-1 flex flex-col items-center transition-all duration-300 z-40 pointer-events-auto"
               :style="{ left: progressPercentage + '%' }"
               style="transform: translateX(-50%);"
               @click.stop="toggleProgressDisplay"
            >
               <div 
                 class="bg-purple-600 px-2 py-0.5 rounded-full text-[8px] font-black text-white tracking-widest shadow-lg relative min-w-[24px] text-center border transition-all duration-300 cursor-pointer hover:scale-110 active:scale-95 hover:bg-purple-500"
                 :style="{ 
                    backgroundColor: colorLoaded ? 'var(--card-accent)' : undefined,
                    borderColor: colorLoaded ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)'
                 }"
               >
                   {{ showTimeRemaining ? remainingTimeText : Math.round(progressPercentage) + '%' }}
                   <!-- The 'Beak' Anchor -->
                   <div 
                     class="absolute -bottom-[3px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[3px]"
                     :style="{ borderTopColor: colorLoaded ? 'var(--card-accent)' : '#A855F7' }"
                   ></div>
               </div>
            </div>
         </div>
      </div>

    </div>
    
    <!-- Permanent Metadata Display -->
    <div v-if="showMetadata" class="mt-3 px-1 flex flex-col gap-1 w-full min-h-[3em]">
      <h3 class="text-[11px] font-black text-white uppercase tracking-tight leading-[1.2] transition-colors line-clamp-2 w-full break-words" :title="item.media.metadata.title" :style="{ color: colorLoaded ? 'color-mix(in srgb, var(--card-accent) 80%, white)' : undefined }">
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