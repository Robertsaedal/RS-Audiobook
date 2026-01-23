
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

// Prepare stack layers (max 3 items)
// We want the first item on top, so we grab slice(0, 3)
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

      <!-- Dynamic Stack Container -->
      <div class="relative w-full h-full">
        
        <!-- Render Stack Layers (Reverse Loop to paint bottom-up if using absolute z-index, but we use explicit z-indexes) -->
        <template v-if="stackImages.length > 1">
           <!-- Bottom Layer (3rd Book) -->
           <div 
             v-if="stackImages[2]"
             class="absolute inset-0 rounded-md bg-neutral-900 border border-white/5 shadow-2xl transition-transform duration-500 ease-out group-hover:translate-x-4 group-hover:rotate-6 z-0"
             class-img="brightness-50"
             style="transform: rotate(6deg) translateX(4px);"
           >
              <img :src="stackImages[2]" class="w-full h-full object-cover brightness-[0.4]" loading="lazy" />
           </div>

           <!-- Middle Layer (2nd Book) -->
           <div 
             v-if="stackImages[1]"
             class="absolute inset-0 rounded-md bg-neutral-900 border border-white/5 shadow-2xl transition-transform duration-500 ease-out group-hover:translate-x-2 group-hover:rotate-3 z-10"
             style="transform: rotate(3deg) translateX(2px);"
           >
              <img :src="stackImages[1]" class="w-full h-full object-cover brightness-[0.65]" loading="lazy" />
           </div>
        </template>

        <!-- Top Layer (Main Cover) -->
        <div 
          class="absolute inset-0 rounded-md overflow-hidden shadow-2xl border border-white/10 z-20 bg-neutral-900 transition-transform duration-500 group-hover:-translate-y-1"
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
</style>
