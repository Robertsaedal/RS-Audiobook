
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
  <button class="flex flex-col text-left group active:scale-95 transition-all">
    <div class="relative aspect-[2/3] bg-neutral-900 rounded-[24px] overflow-hidden border border-white/5 mb-3">
      <img :src="coverUrl" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
      <div v-if="progress > 0" class="absolute bottom-0 left-0 h-1 bg-black/60 w-full z-10">
        <div class="h-full gradient-aether" :style="{ width: progress + '%' }" />
      </div>
    </div>
    <h3 class="text-[10px] font-black uppercase tracking-tight line-clamp-1">{{ item.media.metadata.title }}</h3>
    <p class="text-[8px] font-black text-neutral-700 uppercase tracking-widest mt-1">{{ item.media.metadata.authorName }}</p>
  </button>
</template>
