
<script setup lang="ts">
import { computed } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { ABSService } from '../services/absService';
import BookCard from './BookCard.vue';

const props = defineProps<{
  absService: ABSService,
  items: ABSLibraryItem[],
  progressMap?: Map<string, ABSProgress>
}>();

const emit = defineEmits<{
  (e: 'resume-book', item: ABSLibraryItem): void,
  (e: 'info-click', item: ABSLibraryItem): void
}>();

const hydratedItems = computed(() => {
  return props.items.map(item => {
    const live = props.progressMap?.get(item.id);
    return live ? { ...item, userProgress: live } : item;
  });
});
</script>

<template>
  <div v-if="items.length > 0" class="mb-12 animate-fade-in">
    <div class="flex items-center justify-between mb-6 px-1">
      <h2 class="text-xl font-black uppercase tracking-tighter text-white">
        Continue Listening
      </h2>
      <div class="h-px flex-1 bg-white/5 mx-6 hidden md:block"></div>
    </div>
    
    <div class="flex overflow-x-auto gap-8 no-scrollbar pb-10 pl-1">
      <div 
        v-for="item in hydratedItems" 
        :key="item.id" 
        class="w-32 md:w-40 shrink-0"
      >
        <BookCard 
          :item="item" 
          :coverUrl="absService.getCoverUrl(item.id)"
          show-metadata 
          show-progress 
          @click="emit('resume-book', item)"
          @info-click="emit('info-click', item)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fade-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
