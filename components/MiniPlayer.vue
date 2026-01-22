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
      class="fixed bottom-16 md:bottom-0 left-0 right-0 h-16 md:h-20 bg-purple-950/90 backdrop-blur-xl border-t border-white/10 z-[100] cursor-pointer shadow-[0_-10px_30px_rgba(0,0,0,0.5)] flex flex-col md:pl-20 transition-all duration-300"
    >
      <!-- Glowing Progress Line -->
      <div class="h-0.5 w-full bg-neutral-800/50">
        <div 
          class="h-full bg-[var(--cover-accent)] shadow-[0_0_10px_var(--cover-accent)] transition-all duration-300" 
          :style="{ width: progressPercent + '%', '--cover-accent': state.accentColor }"
        />
      </div>

      <div class="flex-1 flex items-center justify-between px-4 max-w-7xl mx-auto w-full">
        <!-- Left: Info -->
        <div class="flex items-center gap-3 overflow-hidden flex-1 pr-4">
          <div class="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-neutral-900 overflow-hidden shrink-0 border border-white/10 relative shadow-lg">
             <div class="absolute inset-0 bg-[var(--cover-accent)] opacity-20" :style="{ '--cover-accent': state.accentColor }"></div>
             <img :src="coverUrl" class="w-full h-full object-cover relative z-10" />
          </div>
          <div class="flex flex-col overflow-hidden">
            <span class="text-xs md:text-sm font-black text-white truncate leading-tight">{{ activeItem.media.metadata.title }}</span>
            <span class="text-[10px] font-bold text-neutral-400 truncate uppercase tracking-wide">{{ activeItem.media.metadata.authorName }}</span>
          </div>
        </div>

        <!-- Right: Controls -->
        <div class="flex items-center gap-3 md:gap-6 shrink-0">
           <!-- Force Sync Button -->
           <button @click="handleSync" class="p-2 text-neutral-500 hover:text-purple-400 transition-colors hidden sm:block" title="Sync Progress">
              <RotateCw :size="16" />
           </button>

           <button @click="rewind" class="p-2 text-neutral-400 hover:text-white transition-colors active:scale-90 hidden sm:block">
              <RotateCcw :size="20" />
           </button>

           <button 
             @click="togglePlay"
             class="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center bg-white text-black hover:scale-105 active:scale-95 transition-all shadow-lg"
           >
             <Pause v-if="state.isPlaying" :size="20" fill="currentColor" />
             <Play v-else :size="20" fill="currentColor" class="translate-x-0.5" />
           </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
}
</style>