
<script setup lang="ts">
import { computed } from 'vue';
import { ABSSeries } from '../types';
import { Layers } from 'lucide-vue-next';

const props = defineProps<{
  series: ABSSeries,
  coverUrl: string
}>();

const authorName = computed(() => {
  if (props.series.books && props.series.books.length > 0) {
    return props.series.books[0].media.metadata.authorName;
  }
  return 'Unknown Author';
});
</script>

<template>
  <button class="flex flex-col text-left group active:scale-95 transition-all outline-none w-full h-full">
    <div class="series-cover-container mb-6">
      <!-- The Stack Visual -->
      <div class="absolute -inset-1 bg-purple-500/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-[32px]" />
      
      <img 
        :src="coverUrl" 
        class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" 
        loading="lazy" 
      />

      <!-- Book Count Pill -->
      <div class="series-badge flex items-center gap-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)] border-purple-500/20">
        <Layers :size="10" class="text-purple-500" />
        <span>{{ series.numBooks }} Artifacts</span>
      </div>

      <!-- Highlight for stacked layers -->
      <div class="absolute inset-0 z-0 pointer-events-none border border-purple-500/0 group-hover:border-purple-500/20 rounded-[24px] transition-colors" />
    </div>

    <!-- Metadata Section -->
    <div class="mt-2 px-1 space-y-1.5">
      <h3 class="text-xs font-black uppercase tracking-tight line-clamp-2 leading-tight text-neutral-200 group-hover:text-white transition-colors">
        {{ series.name }}
      </h3>
      <p class="text-[9px] font-black text-neutral-600 uppercase tracking-[0.2em] line-clamp-1 group-hover:text-purple-500 transition-colors">
        {{ authorName }}
      </p>
    </div>
  </button>
</template>

<style scoped>
/* Inherits global series styles from index.css */
</style>
