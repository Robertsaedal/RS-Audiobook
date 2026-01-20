<script setup lang="ts">
import { computed } from 'vue';
import { ABSSeries } from '../types';

const props = defineProps<{
  series: ABSSeries,
  coverUrl: string,
  bookCovers: string[]
}>();

const emit = defineEmits<{
  (e: 'click'): void
}>();

// Book count prioritized: books array length -> total property (server-side) -> numBooks property
const bookCount = computed(() => props.series.books?.length || props.series.total || props.series.numBooks || 0);
</script>

<template>
  <button @click="emit('click')" class="relative group w-full h-52 flex flex-col justify-end pt-8 transition-all">
    <div class="relative w-32 md:w-40 h-48 mx-auto">
      
      <!-- Back Card Layer 2 -->
      <div v-if="bookCovers.length > 2" 
        class="absolute inset-0 bg-neutral-900 rounded-xl shadow-xl translate-x-6 -translate-y-5 scale-95 z-0 border border-white/5 opacity-30 group-hover:translate-x-9 group-hover:-translate-y-8 transition-all duration-700"
        :style="{ backgroundImage: `url(${bookCovers[2]})`, backgroundSize: 'cover', backgroundPosition: 'center' }"
      />
      
      <!-- Back Card Layer 1 -->
      <div v-if="bookCovers.length > 1" 
        class="absolute inset-0 bg-neutral-900 rounded-xl shadow-xl translate-x-3 -translate-y-2.5 scale-[0.975] z-10 border border-white/5 opacity-60 group-hover:translate-x-5 group-hover:-translate-y-4 transition-all duration-700"
        :style="{ backgroundImage: `url(${bookCovers[1]})`, backgroundSize: 'cover', backgroundPosition: 'center' }"
      />

      <!-- Main Focus Artifact -->
      <div class="absolute inset-0 z-20 bg-neutral-900 rounded-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] border border-white/10 group-hover:scale-[1.05] transition-all duration-700 overflow-hidden group-hover:border-purple-500/30">
        <img :src="coverUrl" class="w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-110" />
        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent flex items-end p-4">
          <span class="text-[11px] font-black uppercase text-white truncate w-full shadow-lg tracking-tight leading-none group-hover:text-purple-400 transition-colors">{{ series.name }}</span>
        </div>
      </div>

      <!-- Numeric Book Count Badge - High Contrast -->
      <div v-if="bookCount > 0" class="absolute -top-4 -right-4 z-30 w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center font-black text-xs border-4 border-[#0d0d0d] shadow-[0_0_20px_rgba(168,85,247,0.4)] transform group-hover:scale-110 group-hover:bg-purple-500 transition-all">
        {{ bookCount }}
      </div>
    </div>
  </button>
</template>