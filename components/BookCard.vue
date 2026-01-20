<script setup lang="ts">
import { ref, computed } from 'vue';
import { ABSLibraryItem } from '../types';
import { Play } from 'lucide-vue-next';

const props = defineProps<{
  item: ABSLibraryItem,
  coverUrl: string,
  isSelected?: boolean,
  showMetadata?: boolean,
  fallbackSequence?: number | string
}>();

const emit = defineEmits<{
  (e: 'click', item: ABSLibraryItem): void
}>();

const imageReady = ref(false);

const progress = computed(() => {
  if (!props.item?.userProgress) return 0;
  const current = props.item.userProgress.currentTime || 0;
  const total = props.item.media.duration || props.item.userProgress.duration || 1;
  return Math.min(100, (current / total) * 100);
});

const isFinished = computed(() => props.item?.userProgress?.isFinished || false);

const displaySequence = computed(() => {
  // Prioritize seriesSequence from API, then sequence, then UI fallback
  const raw = props.item?.media?.metadata?.seriesSequence || props.item?.media?.metadata?.sequence || props.fallbackSequence;
  
  if (raw === undefined || raw === null || raw === '') return null;
  
  const num = parseFloat(String(raw));
  if (isNaN(num)) return raw;
  
  // Logic: If whole number (e.g. 1.0), show #1. If decimal (e.g. 1.5), show #1.5.
  return num % 1 === 0 ? Math.floor(num) : num;
});

const handleImageLoad = () => {
  imageReady.value = true;
};
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
        :src="coverUrl" 
        @load="handleImageLoad"
        class="w-full h-full object-cover transition-opacity duration-700" 
        :class="{ 'opacity-0': !imageReady, 'opacity-100': imageReady }"
        loading="lazy" 
      />
      
      <!-- Book Sequence Badge (Top Right Pill) -->
      <div v-if="displaySequence !== null" class="absolute top-2.5 right-2.5 bg-purple-600/90 backdrop-blur-md px-2.5 py-1 rounded-full flex items-center justify-center text-[10px] font-black text-white border border-white/20 shadow-xl z-30 tracking-tight">
        #{{ displaySequence }}
      </div>

      <!-- Play Overlay -->
      <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center">
        <div class="w-14 h-14 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.5)] transform scale-90 group-hover:scale-100 transition-transform">
          <Play :size="24" fill="currentColor" class="translate-x-0.5" />
        </div>
      </div>

      <!-- High-Contrast Progress Bar (Bottom Edge) -->
      <div v-if="progress > 0 && !isFinished" class="absolute bottom-0 left-0 h-1.5 w-full bg-black/60 z-30">
        <div 
          class="h-full bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.8)] transition-all duration-300" 
          :style="{ width: progress + '%' }" 
        />
      </div>
      <div v-if="isFinished" class="absolute bottom-0 left-0 h-1.5 w-full bg-green-500 z-30 shadow-[0_0_10px_rgba(34,197,94,0.3)]" />
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