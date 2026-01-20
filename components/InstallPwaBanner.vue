<script setup lang="ts">
import { Download, X, Share, PlusSquare } from 'lucide-vue-next';

defineProps<{
  show: boolean,
  isIOS?: boolean
}>();

const emit = defineEmits<{
  (e: 'install'): void,
  (e: 'dismiss'): void
}>();
</script>

<template>
  <Transition name="slide-up">
    <div v-if="show" class="fixed bottom-0 left-0 right-0 md:left-auto md:right-8 md:bottom-8 md:w-96 bg-purple-600 text-white shadow-[0_-10px_40px_rgba(147,51,234,0.4)] z-[200] p-6 md:rounded-3xl flex flex-col gap-4 safe-bottom border-t md:border border-white/10">
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 shadow-inner border border-white/10">
            <Share v-if="isIOS" class="text-white" :size="20" />
            <Download v-else class="text-white" :size="20" />
          </div>
          <div class="space-y-1">
            <h3 class="text-sm font-black uppercase tracking-wider leading-none">Install R.S Player</h3>
            <p v-if="isIOS" class="text-[10px] font-medium text-white/90 leading-tight max-w-[200px]">
              Tap <span class="font-bold bg-white/20 px-1 rounded">Share</span> then <span class="font-bold bg-white/20 px-1 rounded">Add to Home Screen</span>
            </p>
            <p v-else class="text-[10px] font-medium text-white/90 leading-tight">
              Install for the best audio experience.
            </p>
          </div>
        </div>
        <button @click="emit('dismiss')" class="p-2 -mr-2 -mt-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white">
          <X :size="18" />
        </button>
      </div>
      
      <button 
        v-if="!isIOS"
        @click="emit('install')" 
        class="w-full py-3 bg-white text-purple-600 font-black uppercase tracking-[0.2em] text-[10px] rounded-xl hover:bg-neutral-100 transition-colors shadow-lg active:scale-95"
      >
        Install Application
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.5s cubic-bezier(0.19, 1, 0.22, 1);
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(120%);
}
</style>