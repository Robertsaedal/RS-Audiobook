
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

// Limit to 3 covers for the stack logic
const stackImages = computed(() => {
  if (props.bookCovers && props.bookCovers.length > 0) {
    return props.bookCovers.slice(0, 3);
  }
  return [props.coverUrl];
});

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
    class="relative group w-full flex flex-col items-center outline-none"
    :style="{ '--series-accent': accentColor }"
  >
    <!-- Card Visuals Container -->
    <!-- Added top margin to account for the upward stack offset -->
    <div class="relative w-full aspect-[2/3] mb-4 mt-3 z-10">
      
      <!-- Ambient Glow (Background) -->
      <div 
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] blur-3xl opacity-0 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none"
        :style="{ backgroundColor: accentColor }"
      />

      <!-- Dynamic Stack Container -->
      <div class="relative w-full h-full">
        
        <!-- Bottom Layer (3rd Book) -->
        <!-- Offset: Right 12px, Top -12px -->
        <div 
          v-if="stackImages[2]"
          class="absolute inset-0 rounded-md bg-neutral-900 shadow-sm transition-transform duration-300 ease-out z-0 border border-white/5 overflow-hidden brightness-75 translate-x-3 -translate-y-3"
        >
          <img :src="stackImages[2]" class="w-full h-full object-cover" loading="lazy" />
        </div>

        <!-- Middle Layer (2nd Book) -->
        <!-- Offset: Right 6px, Top -6px -->
        <div 
          v-if="stackImages[1]"
          class="absolute inset-0 rounded-md bg-neutral-900 shadow-md transition-transform duration-300 ease-out z-10 border border-white/10 overflow-hidden brightness-90 translate-x-1.5 -translate-y-1.5"
        >
          <img :src="stackImages[1]" class="w-full h-full object-cover" loading="lazy" />
        </div>

        <!-- Top Layer (Main Cover) -->
        <div 
          class="absolute inset-0 rounded-md overflow-hidden drop-shadow-xl border border-white/10 z-20 bg-neutral-900 transition-transform duration-300 group-hover:-translate-y-1"
          :style="{ borderColor: colorLoaded ? 'color-mix(in srgb, var(--series-accent) 40%, transparent)' : 'rgba(255,255,255,0.1)' }"
        >
          <div v-if="!imageReady" class="absolute inset-0 animate-pulse bg-neutral-800" />
          <img 
            :src="stackImages[0] || coverUrl" 
            @load="handleImageLoad"
            class="w-full h-full object-cover"
            :class="{ 'opacity-0': !imageReady, 'opacity-100': imageReady }"
            loading="lazy"
          />
        </div>

      </div>

      <!-- Floating Badge -->
      <div 
        class="absolute -top-4 -right-2 z-30 flex items-center justify-center backdrop-blur-xl border border-white/20 shadow-lg transition-all duration-300 group-hover:scale-110"
        :class="bookCount >= 10 ? 'px-2.5 py-1 rounded-full min-w-[32px]' : 'w-8 h-8 rounded-full'"
        :style="{ 
          backgroundColor: colorLoaded ? 'color-mix(in srgb, var(--series-accent) 80%, black)' : '#A855F7',
          boxShadow: `0 0 15px -5px ${accentColor}`
        }"
      >
        <span class="text-[10px] font-black text-white leading-none tracking-tight">
          {{ bookCount }}
        </span>
      </div>
    </div>

    <!-- Metadata (Centered) -->
    <div class="px-2 flex flex-col gap-1 text-center w-full">
      <h3 class="text-sm font-bold text-white uppercase tracking-tight leading-tight line-clamp-2 group-hover:text-purple-400 transition-colors w-full">
        {{ series.name }}
      </h3>
      <span class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest w-full">
        {{ bookCount }} {{ bookCount === 1 ? 'Book' : 'Books' }}
      </span>
    </div>
  </button>
</template>
