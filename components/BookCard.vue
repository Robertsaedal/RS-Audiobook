
<script setup lang="ts">
import { computed } from 'vue';
import { ABSLibraryItem } from '../types';

const props = defineProps<{
  item: ABSLibraryItem,
  coverUrl: string,
  isSelected?: boolean
}>();

const progress = computed(() => (props.item.userProgress?.progress || 0) * 100);
</script>

<template>
  <button 
    class="flex flex-col text-left group active:scale-95 transition-all outline-none w-full h-full"
    :class="{ 'scale-95': isSelected }"
  >
    <div 
      class="relative w-full h-full bg-neutral-900 rounded-[28px] overflow-hidden border transition-all duration-300 shadow-xl"
      :class="[
        isSelected 
          ? 'border-purple-500 shadow-[0_0_30px_rgba(157,80,187,0.4)]' 
          : 'border-white/5 group-hover:shadow-[0_0_30px_rgba(157,80,187,0.2)] group-hover:border-purple-500/30'
      ]"
    >
      <img 
        :src="coverUrl" 
        class="w-full h-full object-cover transition-transform duration-700" 
        :class="{ 'scale-110 blur-sm grayscale-[0.5]': isSelected, 'group-hover:scale-110': !isSelected }"
        loading="lazy" 
      />
      
      <!-- Progress Bar Overlay -->
      <div v-if="progress > 0" class="absolute bottom-0 left-0 h-1.5 w-full bg-black/80 backdrop-blur-md z-10">
        <div class="h-full gradient-aether shadow-aether-glow transition-all" :style="{ width: progress + '%' }" />
      </div>

      <!-- Play/Selected Overlay -->
      <div class="absolute inset-0 bg-purple-900/20 opacity-0 transition-opacity flex items-center justify-center" :class="{ 'opacity-100': isSelected, 'group-hover:opacity-100': !isSelected }">
        <div class="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-transform duration-300">
          <svg v-if="!isSelected" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none" class="translate-x-0.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
      </div>
    </div>
    
    <!-- Meta Info -->
    <div class="mt-4 px-1 space-y-1">
      <h3 class="text-[11px] font-black uppercase tracking-tight line-clamp-2 leading-tight text-neutral-200 group-hover:text-white transition-colors">
        {{ item.media.metadata.title }}
      </h3>
      <p class="text-[8px] font-black text-neutral-600 uppercase tracking-widest line-clamp-1 group-hover:text-purple-500 transition-colors">
        {{ item.media.metadata.authorName }}
      </p>
    </div>
  </button>
</template>
