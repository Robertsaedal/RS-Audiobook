
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { Play, Smartphone, Info, Heart } from 'lucide-vue-next';
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
  (e: 'click', item: ABSLibraryItem): void,
  (e: 'info-click', item: ABSLibraryItem): void
}>();

const imageReady = ref(false);
const isDownloaded = ref(false);
const isWishlisted = ref(false);
const localCover = ref<string | null>(null);
const accentColor = ref('#A855F7'); 
const colorLoaded = ref(false);

const progressData = computed(() => {
  return props.item.userProgress || (props.item.media as any)?.userProgress || null;
});

const progressPercentage = computed(() => {
  const p = progressData.value;
  const media = props.item.media;
  if (p?.isFinished) return 100;
  const totalDuration = media?.duration || p?.duration || 0;
  const currentTime = p?.currentTime || 0;
  if (totalDuration > 0 && currentTime > 0) return Math.min(100, (currentTime / totalDuration) * 100);
  if (typeof p?.progress === 'number') return Math.min(100, p.progress * 100);
  return 0;
});

const isFinished = computed(() => {
  const p = progressData.value;
  return p?.isFinished || progressPercentage.value >= 99.5;
});

const displaySequence = computed(() => {
  if (props.fallbackSequence) return props.fallbackSequence;
  const meta = props.item.media?.metadata;
  return meta?.seriesSequence || meta?.sequence || null;
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

const updateStates = async () => {
  isDownloaded.value = await OfflineManager.isDownloaded(props.item.id);
  isWishlisted.value = await OfflineManager.isWishlisted(props.item.id);
  if (isDownloaded.value) {
    localCover.value = await OfflineManager.getCoverUrl(props.item.id);
  }
};

onMounted(updateStates);

watch(() => props.item.id, updateStates);
</script>

<template>
  <button 
    @click="emit('click', item)"
    class="flex flex-col text-left group transition-all outline-none w-full relative h-full"
    :style="{ '--card-accent': accentColor }"
  >
    <div 
      class="relative w-full aspect-[2/3] bg-neutral-950 rounded-xl overflow-hidden border transition-all duration-500 shadow-[0_10px_40px_-10px_var(--card-accent)] group-hover:scale-[1.04] shrink-0"
      :style="{ borderColor: colorLoaded ? 'color-mix(in srgb, var(--card-accent) 40%, transparent)' : 'rgba(255,255,255,0.05)' }"
    >
      <div v-if="!imageReady" class="absolute inset-0 z-10 animate-shimmer" />

      <img 
        :src="localCover || coverUrl" 
        @load="handleImageLoad"
        class="w-full h-full object-cover transition-opacity duration-700" 
        :class="{ 'opacity-0': !imageReady, 'opacity-100': imageReady }"
      />
      
      <!-- Info Badge (Top Right Action) - Persistent Shortcut -->
      <button 
        @click.stop="emit('info-click', item)"
        class="absolute top-2 right-2 z-[60] p-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full text-white/70 hover:text-white hover:bg-purple-600 transition-all active:scale-90 shadow-xl"
        title="View Metadata"
      >
        <Info :size="14" />
      </button>

      <!-- Offline Badge -->
      <div v-if="isDownloaded" class="absolute top-12 right-2 z-30 flex items-center gap-1.5 px-2 py-1 bg-black/80 backdrop-blur-md border border-emerald-500/30 rounded-full shadow-xl">
        <Smartphone :size="10" class="text-emerald-500" />
      </div>

      <!-- Wishlist Heart (Top Left if not Sequence) -->
      <div v-if="isWishlisted" class="absolute top-2 left-2 z-30 animate-tap-pop">
        <div class="p-1.5 bg-purple-600 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.6)] border border-purple-400/30">
          <Heart :size="10" fill="white" class="text-white" />
        </div>
      </div>

      <!-- Sequence Badge -->
      <div v-if="displaySequence !== null" class="absolute z-30" :class="isWishlisted ? 'top-10 left-2' : 'top-2 left-2'">
        <div class="px-2 py-1 bg-black/70 backdrop-blur-md border border-white/10 rounded-md shadow-lg">
          <span class="text-[10px] font-black text-purple-400">#{{ displaySequence }}</span>
        </div>
      </div>

      <!-- Play Overlay (Only on Hover) -->
      <div v-if="!isFinished" class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center pointer-events-none">
        <div class="w-14 h-14 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.5)] transform scale-90 group-hover:scale-100 transition-transform">
          <Play :size="24" fill="currentColor" class="translate-x-0.5" />
        </div>
      </div>

      <!-- Progress Bar -->
      <div v-if="!hideProgress && !isFinished && progressPercentage > 0" class="absolute bottom-3 left-3 right-3 z-30 flex flex-col pointer-events-none">
         <div class="relative w-full h-1.5 bg-purple-950/40 backdrop-blur-sm rounded-full overflow-hidden">
            <div class="h-full bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all duration-300" :style="{ width: progressPercentage + '%', backgroundColor: accentColor }" />
         </div>
      </div>
    </div>
    
    <div v-if="showMetadata" class="mt-3 px-1 flex flex-col gap-1 w-full min-h-[3.5em]">
      <h3 class="text-[11px] font-black text-white uppercase tracking-tight leading-[1.3] line-clamp-2 w-full break-words group-hover:text-purple-400 transition-colors">
        {{ item.media.metadata.title }}
      </h3>
      <p class="text-[9px] font-black text-neutral-500 uppercase tracking-widest truncate w-full">
        {{ item.media.metadata.authorName }}
      </p>
    </div>
  </button>
</template>
