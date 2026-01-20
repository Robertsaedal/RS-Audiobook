<script setup lang="ts">
import { Download, X } from 'lucide-vue-next';

defineProps<{
  show: boolean
}>();

const emit = defineEmits<{
  (e: 'install'): void,
  (e: 'dismiss'): void
}>();
</script>

<template>
  <Transition name="slide-up">
    <div v-if="show" class="fixed bottom-20 left-4 right-4 md:left-auto md:right-8 md:bottom-8 md:w-96 bg-[#1a1a1a] border border-purple-500/30 rounded-2xl shadow-2xl p-4 z-[200] flex items-center gap-4">
      <div class="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center shrink-0">
        <Download class="text-purple-500" :size="24" />
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-bold text-white leading-tight">Install App</h3>
        <p class="text-[10px] text-neutral-400 mt-0.5">Install R.S Player for the best experience.</p>
      </div>
      <div class="flex items-center gap-2">
        <button 
          @click="emit('dismiss')" 
          class="p-2 text-neutral-500 hover:text-white transition-colors"
        >
          <X :size="18" />
        </button>
        <button 
          @click="emit('install')" 
          class="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-colors"
        >
          Install
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>