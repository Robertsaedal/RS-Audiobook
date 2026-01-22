
<script setup lang="ts">
import { computed, ref, nextTick } from 'vue';
import { 
  Home, BookOpen, Layers, User,
  X, RotateCw, PlusSquare, Search, BarChart2, ArrowLeft
} from 'lucide-vue-next';
import confetti from 'canvas-confetti';
import AppLogo from './AppLogo.vue';

export type LibraryTab = 'HOME' | 'LIBRARY' | 'SERIES' | 'REQUEST' | 'STATS';

const props = defineProps<{
  activeTab: LibraryTab;
  search: string;
  isScanning?: boolean;
  isStreaming?: boolean;
  username?: string;
  selectedCount?: number;
}>();

const emit = defineEmits<{
  (e: 'tab-change', tab: LibraryTab): void;
  (e: 'logout'): void;
  (e: 'scan'): void;
  (e: 'clear-selection'): void;
  (e: 'update:search', val: string): void;
}>();

const version = "5.5.0";
const showMobileSearch = ref(false);
const mobileInputRef = ref<HTMLInputElement | null>(null);

const navItems = [
  { id: 'HOME' as LibraryTab, icon: Home, label: 'Home' },
  { id: 'LIBRARY' as LibraryTab, icon: BookOpen, label: 'Library' },
  { id: 'SERIES' as LibraryTab, icon: Layers, label: 'Series' },
  { id: 'STATS' as LibraryTab, icon: BarChart2, label: 'Stats' },
];

const triggerSuccessSparks = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  confetti({
    particleCount: 50,
    spread: 60,
    origin: { 
      x: (rect.left + rect.width / 2) / window.innerWidth, 
      y: (rect.top + rect.height / 2) / window.innerHeight 
    },
    colors: ['#A855F7', '#D8B4FE', '#FFFFFF'],
    gravity: 1.1,
    ticks: 150,
    shapes: ['circle'],
    scalar: 0.8
  });
};

const handleRequestClick = (event: MouseEvent) => {
  triggerSuccessSparks(event.currentTarget as HTMLElement);
  emit('tab-change', 'REQUEST');
};

const openMobileSearch = async () => {
  showMobileSearch.value = true;
  await nextTick();
  mobileInputRef.value?.focus();
};

const closeMobileSearch = () => {
  showMobileSearch.value = false;
  if (props.search) {
    emit('update:search', '');
  }
};
</script>

<template>
  <div class="flex h-screen w-full bg-[#0d0d0d] text-white overflow-hidden relative selection:bg-purple-500/30">
    
    <!-- Ambient Glow Background -->
    <div class="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-purple-900/20 via-[#0d0d0d] to-[#0d0d0d]"></div>
    
    <!-- Top Appbar -->
    <header class="h-16 w-full fixed top-0 left-0 right-0 bg-[#0d0d0d]/80 backdrop-blur-xl z-[60] px-4 md:px-6 flex items-center justify-between border-b border-white/5">
      <div class="flex items-center gap-4 min-w-0 shrink">
        <div class="flex items-center cursor-pointer group shrink-0" @click="emit('tab-change', 'HOME')">
          <AppLogo className="w-8 h-8 mr-3 group-hover:scale-105 transition-transform" />
          <h1 class="text-sm md:text-xl font-bold tracking-tight truncate">R.S Audiobook Player</h1>
        </div>
      </div>

      <!-- Desktop Global Search -->
      <div class="hidden md:flex items-center gap-4 flex-1 max-w-2xl px-8">
        <!-- Search Bar -->
        <div class="relative group flex-1">
          <input
            type="text"
            placeholder="Search artifacts..."
            :value="search"
            @input="e => emit('update:search', (e.target as HTMLInputElement).value)"
            class="w-full bg-black/40 border border-white/5 rounded-full py-2.5 pl-10 pr-4 text-xs text-white placeholder-neutral-800 focus:border-purple-500/40 outline-none transition-all focus:bg-black/60"
          />
          <Search class="w-4 h-4 text-neutral-800 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-purple-500 transition-colors" />
        </div>
      </div>

      <!-- Mobile Search Icon -->
      <div class="flex md:hidden items-center justify-end flex-1 px-2">
        <button 
          @click="openMobileSearch"
          class="p-2 text-neutral-400 hover:text-white transition-colors"
        >
          <Search :size="20" />
        </button>
      </div>

      <div class="flex items-center gap-2 md:gap-4 shrink-0">
        <!-- Request Button (Optimized for Mobile) -->
        <button 
          @click="handleRequestClick"
          class="flex items-center gap-2 p-2 sm:px-4 sm:py-2 bg-transparent border border-purple-500/30 rounded-full text-[10px] font-black uppercase tracking-widest text-purple-400 hover:bg-purple-500/10 transition-all shrink-0 active:scale-95"
          title="Request Artifact"
        >
          <PlusSquare :size="18" />
          <span class="hidden sm:inline">Request</span>
        </button>

        <!-- Top-Right Sync Icon -->
        <button 
          @click="emit('scan')"
          class="p-2.5 rounded-full bg-white/5 hover:bg-purple-600/10 border border-white/10 transition-all group"
          :class="{ 'text-purple-400 border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.4)]': isScanning, 'text-neutral-500 hover:text-white': !isScanning }"
          title="Scan Library"
        >
          <RotateCw :size="18" :class="{ 'animate-spin': isScanning }" />
        </button>

        <!-- User Profile -->
        <div 
          @click="emit('logout')"
          class="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full pl-3 pr-1 py-1 cursor-pointer hover:bg-neutral-800 transition-all"
        >
          <span class="text-[11px] font-bold hidden md:block uppercase tracking-wider">{{ username || 'User' }}</span>
          <div class="w-8 h-8 rounded-full bg-neutral-900 flex items-center justify-center text-neutral-300 border border-white/10">
            <User :size="14" />
          </div>
        </div>
      </div>

      <!-- Mobile Search Overlay -->
      <Transition name="slide-down">
        <div v-if="showMobileSearch" class="absolute inset-0 bg-[#111111] z-[70] flex items-center px-4 gap-3 border-b border-white/10">
          <button @click="closeMobileSearch" class="p-2 -ml-2 text-neutral-400 hover:text-white">
            <ArrowLeft :size="20" />
          </button>
          <div class="flex-1 relative">
            <input
              ref="mobileInputRef"
              type="text"
              placeholder="Search library..."
              :value="search"
              @input="e => emit('update:search', (e.target as HTMLInputElement).value)"
              class="w-full bg-black/40 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-white placeholder-neutral-600 focus:border-purple-500/50 outline-none"
            />
            <Search class="w-4 h-4 text-neutral-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      </Transition>
    </header>

    <!-- Side Rail -->
    <aside class="w-20 hidden md:flex h-full fixed left-0 top-16 bg-[#0d0d0d]/80 backdrop-blur-sm border-r border-white/5 flex-col items-center z-50">
      <div id="siderail-buttons-container" class="w-full flex-1 overflow-y-auto no-scrollbar">
        <button
          v-for="item in navItems"
          :key="item.id"
          @click="emit('tab-change', item.id)"
          class="w-full h-20 flex flex-col items-center justify-center text-white border-b border-white/5 hover:bg-white/5 transition-all relative group"
          :class="activeTab === item.id ? 'bg-purple-600/10' : 'opacity-60 hover:opacity-100'"
        >
          <component :is="item.icon" :size="22" :class="activeTab === item.id ? 'text-purple-400' : ''" />
          <p class="pt-2 text-center text-[9px] font-bold uppercase tracking-widest leading-none">{{ item.label }}</p>
          <div v-show="activeTab === item.id" class="h-8 w-1 bg-purple-500 absolute top-1/2 -translate-y-1/2 left-0 rounded-r-full shadow-[0_0_10px_#A855F7]" />
        </button>
      </div>

      <div class="w-full border-t border-white/5 py-6 flex flex-col items-center gap-4 opacity-30">
        <p class="text-[8px] font-mono text-neutral-700 leading-none">v{{ version }}</p>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div 
      id="app-content" 
      class="flex-1 h-full pt-16 relative z-10"
      :class="{ 'has-siderail': true }"
    >
      <main 
        class="h-full page-content overflow-hidden"
        :class="{ 'streaming': isStreaming }"
      >
        <!-- Slot Wrapper -->
        <div class="max-w-7xl mx-auto w-full px-4 md:px-8 py-8 h-full flex flex-col">
          <slot></slot>
        </div>
      </main>
    </div>

    <!-- Mobile Navigation Bar -->
    <nav class="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#111111]/90 backdrop-blur-xl border-t border-white/5 flex justify-around items-center z-[60] safe-bottom">
      <button 
        v-for="item in navItems" 
        :key="item.id"
        @click="emit('tab-change', item.id)"
        class="flex flex-col items-center gap-1"
        :class="activeTab === item.id ? 'text-purple-400' : 'text-neutral-500'"
      >
        <component :is="item.icon" :size="20" />
        <span class="text-[9px] font-bold uppercase tracking-wider">{{ item.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.2s ease-out;
}
.slide-down-enter-from, .slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
