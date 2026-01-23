
<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { ABSSeries } from '../types';
import { getDominantColor } from '../services/colorUtils';
import { Layers } from 'lucide-vue-next';

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
    class="relative group w-full h-full flex flex-col text-left outline-none"
    :style="{ '--series-accent': accentColor }"
  >
    <!-- Card Container with Aspect Ratio -->
    <div class="relative w-full aspect-[2/3] perspective-1000 mb-3">
      
      <!-- Ambient Glow (Background) -->
      <div 
        class="absolute inset-0 blur-2xl opacity-0 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none"
        :style="{ backgroundColor: accentColor }"
      />

      <!-- Stack Layer 3 (Deepest) -->
      <div 
        v-if="bookCount > 2"
        class="absolute inset-0 bg-neutral-900 rounded-lg shadow-xl border border-white/5 opacity-40 z-0 transform scale-[0.85] translate-y-1 transition-all duration-500 ease-out group-hover:translate-x-6 group-hover:-rotate-6 group-hover:translate-y-2"
        :style="{ backgroundImage: bookCovers[2] ? `url(${bookCovers[2]})` : undefined, backgroundSize: 'cover' }"
      />

      <!-- Stack Layer 2 (Middle) -->
      <div 
        v-if="bookCount > 1"
        class="absolute inset-0 bg-neutral-900 rounded-lg shadow-xl border border-white/5 opacity-70 z-10 transform scale-[0.92] translate-y-0.5 transition-all duration-500 ease-out group-hover:translate-x-3 group-hover:-rotate-3 group-hover:translate-y-1"
        :style="{ backgroundImage: bookCovers[1] ? `url(${bookCovers[1]})` : undefined, backgroundSize: 'cover' }"
      />

      <!-- Main Cover Layer (Top) -->
      <div 
        class="absolute inset-0 z-20 bg-neutral-900 rounded-xl overflow-hidden shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] border border-white/10 group-hover:scale-[1.02] group-hover:shadow-[0_20px_50px_-10px_rgba(0,0,0,0.7)] transition-all duration-500"
        :style="{ borderColor: colorLoaded ? 'color-mix(in srgb, var(--series-accent) 30%, transparent)' : 'rgba(255,255,255,0.1)' }"
      >
        <div v-if="!imageReady" class="absolute inset-0 animate-pulse bg-neutral-800" />
        <img 
          :src="coverUrl" 
          @load="handleImageLoad"
          class="w-full h-full object-cover transition-transform duration-[3s] group-hover:scale-105"
          :class="{ 'opacity-0': !imageReady, 'opacity-100': imageReady }"
          loading="lazy"
        />

        <!-- Glassmorphism Metadata Overlay -->
        <div class="absolute bottom-0 left-0 right-0 p-3 bg-black/60 backdrop-blur-md border-t border-white/10 flex flex-col gap-0.5 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
           <div class="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-neutral-400">
             <span>Collection</span>
             <span class="text-white bg-white/10 px-1.5 py-0.5 rounded">{{ bookCount }} Items</span>
           </div>
        </div>
      </div>

      <!-- Static Badge (Visible when not hovering) -->
      <div class="absolute top-2 right-2 z-30 px-2 py-1 bg-black/70 backdrop-blur-md border border-white/10 rounded-md shadow-lg group-hover:opacity-0 transition-opacity duration-300">
         <div class="flex items-center gap-1.5">
           <Layers :size="10" class="text-white" :style="{ color: colorLoaded ? accentColor : 'white' }" />
           <span class="text-[9px] font-black text-white">{{ bookCount }}</span>
         </div>
      </div>
    </div>

    <!-- Title Block (Outside Card) -->
    <div class="px-1 flex flex-col gap-1">
      <h3 class="text-[11px] font-black text-white uppercase tracking-tight leading-tight line-clamp-2 group-hover:text-purple-400 transition-colors">
        {{ series.name }}
      </h3>
      <div class="flex items-center gap-2">
         <span class="text-[9px] font-black text-neutral-600 uppercase tracking-widest">Series Stack</span>
      </div>
    </div>
  </button>
</template>

<style scoped>
.perspective-1000 {
  perspective: 1000px;
}
</style>
