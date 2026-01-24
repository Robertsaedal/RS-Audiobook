
<script setup lang="ts">
import { ref, computed } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { ABSService } from '../services/absService';

const props = defineProps<{
  absService: ABSService,
  items: ABSLibraryItem[],
  progressMap?: Map<string, ABSProgress> // New Prop
}>();

const emit = defineEmits<{
  (e: 'resume-book', item: ABSLibraryItem): void
}>();

const getCoverUrl = (itemId: string) => props.absService.getCoverUrl(itemId);

const getProgress = (item: ABSLibraryItem) => {
  if (props.progressMap && props.progressMap.has(item.id)) {
    return props.progressMap.get(item.id)?.progress || 0;
  }
  return item.userProgress?.progress || 0;
};
</script>

<template>
  <div v-if="items.length > 0" class="mb-12 animate-fade-in">
    <h2 class="text-xl font-bold uppercase tracking-widest text-white mb-6 px-1">
      Continue Listening
    </h2>
    
    <div class="flex overflow-x-auto gap-4 no-scrollbar pb-4 -mx-1 px-1">
      <div 
        v-for="item in items" 
        :key="item.id" 
        class="flex-shrink-0 w-32 md:w-40 group cursor-pointer tap-effect"
        @click="emit('resume-book', item)"
      >
        <!-- Artifact Card -->
        <div class="relative h-48 md:h-60 w-full bg-neutral-950 rounded-xl overflow-hidden border border-white/5 transition-transform duration-500 group-hover:scale-[1.03] shadow-2xl">
          <img 
            :src="getCoverUrl(item.id)" 
            class="w-full h-full object-cover transition-opacity duration-300"
            loading="lazy"
          />
          
          <!-- Progress Overlay -->
          <div class="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800/60 z-10">
            <div 
              class="h-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)] transition-all duration-300"
              :style="{ width: getProgress(item) * 100 + '%' }"
            />
          </div>
          
          <!-- Percentage Text (New Addition) -->
          <div class="absolute bottom-2 right-2 z-20">
             <span class="text-[8px] font-black text-purple-400 drop-shadow-md bg-black/60 px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                {{ Math.round(getProgress(item) * 100) }}%
             </span>
          </div>

          <!-- Hover Play State -->
          <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div class="w-12 h-12 rounded-full bg-purple-600/90 text-white flex items-center justify-center shadow-glow">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="translate-x-0.5"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
            </div>
          </div>
        </div>

        <!-- Metadata -->
        <div class="mt-3 space-y-0.5">
          <h3 class="text-[10px] font-bold text-white truncate uppercase tracking-tight leading-none group-hover:text-purple-400 transition-colors">
            {{ item.media.metadata.title }}
          </h3>
          <p v-if="item.media.metadata.seriesName" class="text-[8px] font-black text-purple-400 uppercase tracking-widest truncate">
            {{ item.media.metadata.seriesName }} {{ item.media.metadata.sequence ? `#${item.media.metadata.sequence}` : '' }}
          </p>
          <!-- Brightened Author Text -->
          <p v-else class="text-[8px] font-black text-neutral-400 uppercase tracking-widest truncate">
            {{ item.media.metadata.authorName }}
          </p>
        </div>
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

.shadow-glow {
  box-shadow: 0 0 20px rgba(168, 85, 247, 0.4);
}
</style>
