
<script setup lang="ts">
import { computed } from 'vue';
import { ABSSeries } from '../types';
import { ABSService } from '../services/absService';

const props = defineProps<{
  series: ABSSeries,
  coverUrl: string
}>();

const emit = defineEmits<{
  (e: 'click'): void
}>();

// Get top 3 covers for the stack effect
const stackCovers = computed(() => {
  const auth = JSON.parse(localStorage.getItem('rs_auth') || '{}');
  const service = new ABSService(auth.serverUrl || '', auth.user?.token || '');
  return (props.series.books || []).slice(0, 3).map(b => service.getCoverUrl(b.id));
});
</script>

<template>
  <button @click="emit('click')" class="relative group w-full pt-4 h-56 flex flex-col justify-end">
    <!-- Stack effect using layered covers -->
    <div class="relative w-36 h-48 mx-auto">
      
      <!-- Back Card 2 -->
      <div v-if="stackCovers.length > 2" 
        class="absolute inset-0 bg-neutral-800 rounded-sm shadow-xl translate-x-6 -translate-y-4 scale-95 z-0 border border-white/5 opacity-40 group-hover:translate-x-8 group-hover:-translate-y-6 transition-transform duration-500"
        :style="{ backgroundImage: `url(${stackCovers[2]})`, backgroundSize: 'cover' }"
      />
      
      <!-- Back Card 1 -->
      <div v-if="stackCovers.length > 1" 
        class="absolute inset-0 bg-neutral-800 rounded-sm shadow-xl translate-x-3 -translate-y-2 scale-[0.975] z-10 border border-white/5 opacity-70 group-hover:translate-x-4 group-hover:-translate-y-3 transition-transform duration-500"
        :style="{ backgroundImage: `url(${stackCovers[1]})`, backgroundSize: 'cover' }"
      />

      <!-- Main Front Card -->
      <div class="absolute inset-0 z-20 bg-neutral-900 rounded-sm shadow-2xl border border-white/10 group-hover:scale-105 transition-transform duration-500 overflow-hidden">
        <img :src="coverUrl" class="w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
          <span class="text-[10px] font-black uppercase text-white truncate w-full shadow-lg">{{ series.name }}</span>
        </div>
      </div>

      <!-- Book Count Badge -->
      <div class="absolute -top-2 -right-2 z-30 w-7 h-7 rounded-full bg-yellow-500 text-black flex items-center justify-center font-black text-xs border-2 border-[#1a120b] shadow-lg">
        {{ series.numBooks }}
      </div>
    </div>
  </button>
</template>

<style scoped>
.series-stack-item {
  box-shadow: -5px 0 15px rgba(0,0,0,0.5);
}
</style>
