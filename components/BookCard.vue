
<script setup lang="ts">
import { ref, computed } from 'vue';
import { ABSLibraryItem } from '../types';
import { Play, MoreVertical } from 'lucide-vue-next';

const props = defineProps<{
  item: ABSLibraryItem,
  coverUrl: string,
  isSelected?: boolean
}>();

const emit = defineEmits<{
  (e: 'click', item: ABSLibraryItem): void
}>();

const imageReady = ref(false);
const progress = computed(() => (props.item?.userProgress?.progress || 0) * 100);
const isFinished = computed(() => props.item?.userProgress?.isFinished || false);
const hasSeries = computed(() => !!props.item?.media?.metadata?.seriesName);
const sequence = computed(() => props.item?.media?.metadata?.sequence);

const handleImageLoad = () => {
  imageReady.value = true;
};

const handleCardClick = () => {
  // Safety check to prevent RangeError during initialization or navigation
  if (!props.item?.media) return;
  emit('click', props.item);
};
</script>

<template>
  <button 
    @click="handleCardClick"
    class="flex flex-col text-left group transition-all outline-none w-full relative"
    :class="{ 'scale-[0.98]': isSelected }"
  >
    <!-- Cover Container -->
    <div 
      class="relative w-full aspect-[2/3] bg-neutral-950 rounded-xl overflow-hidden border border-white/5 transition-all duration-500 group-hover:border-purple-500/40 group-hover:shadow-[0_0_25px_rgba(168,85,247,0.25)]"
    >
      <!-- Shimmer Loading State -->
      <div 
        v-if="!imageReady" 
        class="absolute inset-0 z-10 animate-shimmer"
      />

      <!-- Book Cover -->
      <img 
        v-if="item"
        :src="coverUrl" 
        @load="handleImageLoad"
        class="w-full h-full object-cover transition-all duration-500 group-hover:scale-105" 
        :class="{ 
          'opacity-0': !imageReady, 
          'opacity-100': imageReady, 
          'blur-sm grayscale-[0.3]': isSelected 
        }"
        loading="lazy" 
      />
      
      <!-- Sequence Indicator (Top Left - Official Immersive Style) -->
      <div 
        v-if="sequence" 
        class="absolute top-2 left-2 z-30 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md border border-white/10 text-[10px] font-bold text-white shadow-xl"
      >
        #{{ sequence }}
      </div>

      <!-- Hover Overlay -->
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 flex items-center justify-center">
        <!-- More Icon -->
        <div class="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-black/60 transition-all">
          <MoreVertical :size="16" />
        </div>
        
        <!-- Play Icon -->
        <div class="w-14 h-14 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-300">
          <Play :size="24" fill="currentColor" class="translate-x-0.5" />
        </div>
      </div>

      <!-- Premium Progress Bar -->
      <div v-if="progress > 0" class="absolute bottom-0 left-0 h-[2px] w-full bg-white/10 z-40">
        <div 
          class="h-full transition-all duration-500" 
          :class="isFinished ? 'bg-[#22C55E] shadow-[0_0_8px_#22C55E]' : 'bg-[#A855F7] shadow-[0_0_8px_#A855F7]'"
          :style="{ width: progress + '%' }" 
        />
      </div>
    </div>
    
    <!-- Metadata Info -->
    <div class="mt-3 px-1 space-y-0.5">
      <h3 class="text-[11px] font-black uppercase tracking-tight line-clamp-2 leading-tight text-neutral-200 group-hover:text-white transition-colors">
        {{ item?.media?.metadata?.title || 'Unknown Title' }}
      </h3>
      <p class="text-[9px] font-black text-neutral-600 uppercase tracking-widest line-clamp-1 group-hover:text-purple-400 transition-colors">
        {{ item?.media?.metadata?.authorName || 'Unknown Author' }}
      </p>
    </div>
  </button>
</template>

<style scoped>
button {
  -webkit-tap-highlight-color: transparent;
}
</style>
