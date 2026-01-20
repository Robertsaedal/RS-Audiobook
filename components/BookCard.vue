
<script setup lang="ts">
import { ref, computed } from 'vue';
import { ABSLibraryItem } from '../types';
import { Play, Clock } from 'lucide-vue-next';

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
const sequence = computed(() => props.item?.media?.metadata?.sequence);

const handleImageLoad = () => {
  imageReady.value = true;
};
</script>

<template>
  <button 
    @click="emit('click', item)"
    class="flex flex-col text-left group transition-all outline-none w-full relative"
  >
    <!-- Cover Container -->
    <div 
      class="relative w-full aspect-[2/3] bg-neutral-900 rounded-sm overflow-hidden border border-white/5 transition-all duration-300 group-hover:scale-105 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.6)] group-hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.8)]"
    >
      <div v-if="!imageReady" class="absolute inset-0 z-10 animate-shimmer" />

      <img 
        :src="coverUrl" 
        @load="handleImageLoad"
        class="w-full h-full object-cover" 
        :class="{ 'opacity-0': !imageReady, 'opacity-100': imageReady }"
        loading="lazy" 
      />
      
      <!-- Sequence Badge -->
      <div v-if="sequence" class="absolute top-1 left-1 bg-black/70 px-1 py-0.5 rounded-sm text-[8px] font-bold text-white border border-white/10">
        #{{ sequence }}
      </div>

      <!-- Play Hover Overlay -->
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center">
        <div class="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg">
          <Play :size="18" fill="currentColor" class="translate-x-0.5" />
        </div>
      </div>

      <!-- Bottom Progress Bar -->
      <div v-if="progress > 0 && !isFinished" class="absolute bottom-0 left-0 h-1 w-full bg-black/40 z-30">
        <div 
          class="h-full bg-yellow-400 shadow-[0_0_8px_#eab308] transition-all duration-500" 
          :style="{ width: progress + '%' }" 
        />
      </div>
      <div v-if="isFinished" class="absolute bottom-0 left-0 h-1 w-full bg-green-500 z-30" />
    </div>
    
    <!-- Title is hidden on bookshelf view usually, but we keep it small for accessibility -->
    <div class="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <h3 class="text-[10px] font-bold truncate text-neutral-300">{{ item.media.metadata.title }}</h3>
    </div>
  </button>
</template>
