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
  <button @click="emit('click')" class="relative group w-full h-52 flex flex-col justify-end pt-8">
    <!-- Stack effect using layered covers -->
    <div class="relative w-32 md:w-36 h-48 mx-auto">
      
      <!-- Back Card 2 -->
      <div v-if="stackCovers.length > 2" 
        class="absolute inset-0 bg-neutral-900 rounded-lg shadow-xl translate-x-5 -translate-y-4 scale-95 z-0 border border-white/5 opacity-30 group-hover:translate-x-7 group-hover:-translate-y-6 transition-transform duration-500"
        :style="{ backgroundImage: `url(${stackCovers[2]})`, backgroundSize: 'cover' }"
      />
      
      <!-- Back Card 1 -->
      <div v-if="stackCovers.length > 1" 
        class="absolute inset-0 bg-neutral-900 rounded-lg shadow-xl translate-x-2.5 -translate-y-2 scale-[0.975] z-10 border border-white/5 opacity-60 group-hover:translate-x-4 group-hover:-translate-y-3 transition-transform duration-500"
        :style="{ backgroundImage: `url(${stackCovers[1]})`, backgroundSize: 'cover' }"
      />

      <!-- Main Front Card -->
      <div class="absolute inset-0 z-20 bg-neutral-900 rounded-lg shadow-2xl border border-white/10 group-hover:scale-[1.03] transition-transform duration-500 overflow-hidden">
        <img :src="coverUrl" class="w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex items-end p-3">
          <span class="text-[10px] font-black uppercase text-white truncate w-full shadow-lg tracking-tight">{{ series.name }}</span>
        </div>
      </div>

      <!-- Book Count Circular Badge (Top Right) -->
      <div class="absolute -top-3 -right-3 z-30 w-8 h-8 rounded-full bg-yellow-400 text-black flex items-center justify-center font-black text-[11px] border-2 border-[#0a0a0a] shadow-xl transform group-hover:scale-110 transition-transform">
        {{ series.numBooks }}
      </div>
    </div>
  </button>
</template>