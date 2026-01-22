<script setup lang="ts">
import { computed } from 'vue';
import { usePlayer } from '../composables/usePlayer';
import { AuthState } from '../types';
import { Play, Pause, RotateCcw, RotateCw } from 'lucide-vue-next';

const props = defineProps<{
  auth: AuthState | null
}>();

const emit = defineEmits<{
  (e: 'expand'): void
}>();

const { state, play, pause, seek, syncNow } = usePlayer();

const activeItem = computed(() => state.activeItem);
const isVisible = computed(() => !!activeItem.value);

const coverUrl = computed(() => {
  if (!activeItem.value || !props.auth) return '';
  const baseUrl = props.auth.serverUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  return `${baseUrl}/api/items/${activeItem.value.id}/cover?token=${props.auth.user?.token}`;
});

const progressPercent = computed(() => {
  if (!state.duration || state.duration === 0) return 0;
  return (state.currentTime / state.duration) * 100;
});

// Dynamic border progress using conic-gradient
const progressBorderStyle = computed(() => {
  const color = state.accentColor || '#A855F7';
  return {
    background: `conic-gradient(from 0deg, ${color} ${progressPercent.value}%, transparent ${progressPercent.value}%)`
  };
});

const togglePlay = (e: Event) => {
  e.stopPropagation();
  state.isPlaying ? pause() : play();
};

const rewind = (e: Event) => {
  e.stopPropagation();
  seek(state.currentTime - 15);
};

const handleSync = (e: Event) => {
  e.stopPropagation();
  syncNow();
};
</script>

<template>
  <Transition name="slide-up">
    <div 
      v-if="isVisible && activeItem"
      @click="emit('expand')"
      class="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-[420px] h-16 md:h-20 z-[100] group active:scale-[0.98] transition-transform duration-200"
    >
      <!-- Dynamic Progress Border Layer -->
      <div 
        class="absolute inset-0 rounded-2xl opacity-40 group-hover:opacity-100 transition-opacity blur-[1px]" 
        :style="progressBorderStyle"
      ></div>

      <!-- Main Island Body -->
      <div class="absolute inset-[1.5px] bg-purple-950/60 backdrop-blur-xl rounded-[14px] border border-white/10 flex items-center px-3 shadow-2xl overflow-hidden">
        
        <!-- Left: Vinyl Cover Art -->
        <div class="relative shrink-0 w-10 h-10 md:w-12 md:h-12 mr-3 perspective-1000">
          <div 
            class="w-full h-full rounded-full border-2 border-black/40 shadow-xl overflow-hidden transition-transform duration-700"
            :class="{ 'animate-spin-slow': state.isPlaying }"
          >
            <img :src="coverUrl" class="w-full h-full object-cover" />
            <!-- Center Hole -->
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="w-2 h-2 rounded-full bg-black/80 border border-white/10"></div>
            </div>
          </div>
          <!-- Glow behind vinyl -->
          <div 
            class="absolute inset-0 -z-10 blur-lg opacity-40 rounded-full"
            :style="{ backgroundColor: state.accentColor }"
          ></div>
        </div>

        <!-- Middle: Info & Visualizer -->
        <div class="flex-1 min-w-0 flex flex-col justify-center">
          <div class="flex items-center gap-2 overflow-hidden">
            <span class="text-xs font-black text-white truncate uppercase tracking-tight">{{ activeItem.media.metadata.title }}</span>
            <!-- Waveform Visualizer -->
            <div v-if="state.isPlaying" class="flex items-center gap-[2px] h-4 px-1 shrink-0">
              <div class="w-[2px] bg-purple-400 rounded-full animate-wave" style="animation-delay: 0s"></div>
              <div class="w-[2px] bg-purple-300 rounded-full animate-wave" style="animation-delay: 0.2s"></div>
              <div class="w-[2px] bg-purple-400 rounded-full animate-wave" style="animation-delay: 0.1s"></div>
              <div class="w-[2px] bg-purple-500 rounded-full animate-wave" style="animation-delay: 0.3s"></div>
            </div>
          </div>
          <span class="text-[9px] font-bold text-neutral-400 truncate uppercase tracking-[0.2em]">{{ activeItem.media.metadata.authorName }}</span>
        </div>

        <!-- Right: Compact Controls -->
        <div class="flex items-center gap-2 shrink-0 ml-2">
           <button @click="rewind" class="p-2 text-neutral-500 hover:text-white transition-colors active:scale-90 hidden sm:block">
              <RotateCcw :size="16" />
           </button>

           <button 
             @click="togglePlay"
             class="w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center bg-white text-black hover:scale-105 active:scale-90 transition-all shadow-lg"
           >
             <Pause v-if="state.isPlaying" :size="16" fill="currentColor" />
             <Play v-else :size="16" fill="currentColor" class="translate-x-0.5" />
           </button>

           <button @click="handleSync" class="p-2 text-neutral-600 hover:text-purple-400 transition-colors hidden md:block">
              <RotateCw :size="14" />
           </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.5s cubic-bezier(0.17, 0.67, 0.16, 0.99);
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(150px) scale(0.9);
  opacity: 0;
}

.perspective-1000 {
  perspective: 1000px;
}
</style>