<script setup lang="ts">
import { ref, computed } from 'vue';
import { ABSLibraryItem } from '../types';
import { Play } from 'lucide-vue-next';

const props = defineProps<{
  item: ABSLibraryItem,
  coverUrl: string,
  isSelected?: boolean,
  showMetadata?: boolean
}>();

const emit = defineEmits<{
  (e: 'click', item: ABSLibraryItem): void
}>();

const imageReady = ref(false);

// Calculate progress: (currentTime / totalDuration) * 100
const progress = computed(() => {
  if (!props.item?.userProgress) return 0;
  const currentTime = props.item.userProgress.currentTime || 0;
  const totalDuration = props.item.media.duration || props.item.userProgress.duration || 1;
  return Math.min(100, (currentTime / totalDuration) * 100);
});

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
      class="relative w-full aspect-[2/3] bg-neutral-900 rounded-lg overflow-hidden border border-white/5 transition-all duration-300 group-hover:scale-[1.03] shadow-lg group-hover:shadow-2xl"
    >
      <div v-if="!imageReady" class="absolute inset-0 z-10 animate-shimmer" />

      <img 
        :src="coverUrl" 
        @load="handleImageLoad"
        class="w-full h-full object-cover" 
        :class="{ 'opacity-0': !imageReady, 'opacity-100': imageReady }"
        loading="lazy" 
      />
      
      <!-- Sequence Badge (Book Number) -->
      <div v-if="sequence" class="absolute top-2 left-2 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded-md text-[8.5px] font-black text-white border border-white/10 shadow-lg z-30 uppercase tracking-tighter">
        #{{ sequence }}
      </div>

      <!-- Play Hover Overlay -->
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center">
        <div class="w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
          <Play :size="20" fill="currentColor" class="translate-x-0.5" />
        </div>
      </div>

      <!-- Progress Overlay (Thin bottom bar) -->
      <div v-if="progress > 0 && !isFinished" class="absolute bottom-0 left-0 h-1 w-full bg-black/40 z-30 overflow-hidden">
        <div 
          class="h-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)] transition-all duration-300" 
          :style="{ width: progress + '%' }" 
        />
      </div>
      <div v-if="isFinished" class="absolute bottom-0 left-0 h-1 w-full bg-green-500 z-30 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
    </div>
    
    <!-- Optional Metadata below -->
    <div v-if="showMetadata" class="mt-3 px-1 space-y-0.5 overflow-hidden">
      <h3 class="text-[10px] font-bold text-white truncate uppercase tracking-tight">{{ item.media.metadata.title }}</h3>
      <p class="text-[8px] font-black text-neutral-500 uppercase tracking-widest truncate">{{ item.media.metadata.authorName }}</p>
    </div>
  </button>
</template>