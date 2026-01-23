<script setup lang="ts">
import { computed, ref } from 'vue';
import { ABSSeries } from '../types';
import { getDominantColor } from '../services/colorUtils';

const props = defineProps<{
  series: ABSSeries,
  coverUrl: string,
  bookCovers: string[]
}>();

const emit = defineEmits<{
  (e: 'click'): void
}>();

const imageReady = ref(false);
const accentColor = ref('#A855F7'); // Default Purple
const colorLoaded = ref(false);

const bookCount = computed(() => props.series.books?.length || props.series.total || props.series.numBooks || 0);

const handleImageLoad = async () => {
  imageReady.value = true;
  if (!colorLoaded.value && props.coverUrl) {
    colorLoaded.value = true;
    accentColor.value = await getDominantColor(props.coverUrl);
  }
};
</script>

<template>
  <button 
    @click="emit('click')" 
    class="relative group w-full flex flex-col text-left outline-none"
    :style="{ '--series-accent': accentColor }"
  >
    <!-- Card Visuals -->
    <div class="relative w-full aspect-[2/3] mb-4 z-10 perspective-1000">
      
      <!-- Ambient Glow (Background) -->
      <div 
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] blur-3xl opacity-0 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none"
        :style="{ backgroundColor: accentColor }"
      />

      <!-- Infinite Stack Container -->
      <div class="relative w-full h-full transition-transform duration-500 ease-out group-hover:-translate-y-1.5 stack-layer">
        
        <!-- Main Cover -->
        <div 
          class="relative w-full h-full rounded-md overflow-hidden shadow-2xl border border-white/10 z-20 bg-neutral-900"
          :style="{ borderColor: colorLoaded ? 'color-mix(in srgb, var(--series-accent) 40%, transparent)' : 'rgba(255,255,255,0.1)' }"
        >
          <div v-if="!imageReady" class="absolute inset-0 animate-pulse bg-neutral-800" />
          <img 
            :src="coverUrl" 
            @load="handleImageLoad"
            class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            :class="{ 'opacity-0': !imageReady, 'opacity-100': imageReady }"
            loading="lazy"
          />
        </div>

      </div>

      <!-- Floating Badge -->
      <div 
        class="absolute -top-2 -right-2 z-30 flex items-center justify-center backdrop-blur-xl border border-white/20 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all duration-300 group-hover:scale-110 group-hover:-translate-y-1"
        :class="bookCount >= 10 ? 'px-2.5 py-1 rounded-full min-w-[32px]' : 'w-8 h-8 rounded-full'"
        :style="{ 
          backgroundColor: colorLoaded ? 'color-mix(in srgb, var(--series-accent) 70%, black)' : '#A855F7',
          boxShadow: `0 0 20px -5px ${accentColor}`
        }"
      >
        <span class="text-[10px] font-black text-white leading-none drop-shadow-md tracking-tight">
          {{ bookCount }}
        </span>
      </div>
    </div>

    <!-- Metadata -->
    <div class="px-1 flex flex-col gap-1">
      <h3 class="text-sm font-bold text-white uppercase tracking-tight leading-tight line-clamp-2 group-hover:text-purple-400 transition-colors">
        {{ series.name }}
      </h3>
      <span class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
        {{ bookCount }} {{ bookCount === 1 ? 'Book' : 'Books' }}
      </span>
    </div>
  </button>
</template>

<style scoped>
.perspective-1000 {
  perspective: 1000px;
}

/* 
  The Stack Effect
  Using pseudo elements to create the 'pages' behind
*/
.stack-layer::before,
.stack-layer::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  background-color: #1a1a1a; /* Dark page/book color */
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); /* Bouncy spring */
  z-index: -1;
  transform-origin: bottom center;
}

/* Layer 1 (Middle) */
.stack-layer::before {
  transform: rotate(3deg) translateX(4px);
  background: linear-gradient(to right, #262626, #1a1a1a);
  opacity: 0.8;
  z-index: -1;
}

/* Layer 2 (Bottom) */
.stack-layer::after {
  transform: rotate(6deg) translateX(8px) translateY(2px);
  background: linear-gradient(to right, #262626, #111);
  opacity: 0.6;
  z-index: -2;
}

/* Hover: Tighten the stack */
.group:hover .stack-layer::before {
  transform: rotate(1.5deg) translateX(2px);
  opacity: 0.9;
}

.group:hover .stack-layer::after {
  transform: rotate(3deg) translateX(4px) translateY(1px);
  opacity: 0.7;
}
</style>