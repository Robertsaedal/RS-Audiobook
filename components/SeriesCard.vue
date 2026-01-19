
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
  return 'Multiple Creators';
});
</script>

<template>
  <button class="flex flex-col text-left group active:scale-95 transition-all outline-none w-full h-full">
    <div class="series-cover-container mb-6">
      <div class="absolute -inset-1 bg-purple-500/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-[32px]" />
      
      <img 
        :src="coverUrl" 
        class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" 
        loading="lazy" 
      />

      <!-- Artifact Count Pill -->
      <div class="absolute top-2 left-2 z-30 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md border border-white/10 text-[10px] font-bold text-white shadow-xl flex items-center gap-1.5">
        <Layers :size="10" class="text-purple-500" />
        <span>{{ series.numBooks }}</span>
      </div>

      <div class="absolute inset-0 z-0 pointer-events-none border border-purple-500/0 group-hover:border-purple-500/20 rounded-[24px] transition-colors" />
    </div>

    <div class="mt-2 px-1 space-y-1.5">
      <h3 class="text-[11px] font-black uppercase tracking-tight line-clamp-2 leading-tight text-neutral-200 group-hover:text-white transition-colors">
        {{ series.name }}
      </h3>
      <p class="text-[9px] font-black text-neutral-600 uppercase tracking-[0.2em] line-clamp-1 group-hover:text-purple-500 transition-colors">
        {{ authorName }}
      </p>
    </div>
  </button>
</template>
