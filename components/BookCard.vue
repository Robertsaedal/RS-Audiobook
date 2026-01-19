
<script setup lang="ts">
import { computed } from 'vue';
import { ABSLibraryItem } from '../types';

const props = defineProps<{
  item: ABSLibraryItem,
  coverUrl: string
}>();

const progress = computed(() => (props.item.userProgress?.progress || 0) * 100);
</script>

<template>
  <button class="flex flex-col text-left group active:scale-95 transition-all outline-none">
    <div class="relative aspect-[2/3] bg-neutral-900 rounded-[28px] overflow-hidden border border-white/5 mb-4 shadow-xl transition-all group-hover:shadow-[0_0_30px_rgba(157,80,187,0.2)] group-hover:border-purple-500/30 group-focus:ring-2 group-focus:ring-purple-500/40">
      <img :src="coverUrl" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
      
      <!-- Progress Bar Overlay -->
      <div v-if="progress > 0" class="absolute bottom-0 left-0 h-1.5 w-full bg-black/80 backdrop-blur-md z-10">
        <div class="h-full gradient-aether shadow-aether-glow transition-all" :style="{ width: progress + '%' }" />
      </div>

      <!-- Play Overlay -->
      <div class="absolute inset-0 bg-purple-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <div class="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white scale-90 group-hover:scale-100 transition-transform duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none" class="translate-x-0.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      </div>
    </div>
    <div class="px-1 space-y-1">
      <h3 class="text-[11px] font-black uppercase tracking-tight line-clamp-2 leading-tight text-neutral-200 group-hover:text-white transition-colors">{{ item.media.metadata.title }}</h3>
      <p class="text-[8px] font-black text-neutral-600 uppercase tracking-widest line-clamp-1 group-hover:text-purple-500 transition-colors">{{ item.media.metadata.authorName }}</p>
    </div>
  </button>
</template>
