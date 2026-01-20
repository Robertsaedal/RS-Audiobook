<script setup lang="ts">
import { computed, ref } from 'vue';
import { 
  Home, BookOpen, Layers, User, Headphones,
  X, RotateCw, PlusSquare, Search
} from 'lucide-vue-next';
import confetti from 'https://esm.sh/canvas-confetti';

export type LibraryTab = 'HOME' | 'LIBRARY' | 'SERIES' | 'REQUEST';

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

const version = "5.4.0";

const navItems = [
  { id: 'HOME' as LibraryTab, icon: Home, label: 'Home' },
  { id: 'LIBRARY' as LibraryTab, icon: BookOpen, label: 'Library' },
  { id: 'SERIES' as LibraryTab, icon: Layers, label: 'Series' },
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
</script>

<template>
  <div class="flex h-screen w-full bg-[#0a0a0a] text-white overflow-hidden relative">
    
    <!-- Top Appbar -->
    <header class="h-16 w-full fixed top-0 left-0 right-0 bg-[#111111]/80 backdrop-blur-xl z-[60] px-4 md:px-6 flex items-center justify-between border-b border-white/5">
      <div class="flex items-center gap-4">
        <div class="flex items-center cursor-pointer group" @click="emit('tab-change', 'HOME')">
          <div class="w-8 h-8 mr-3 flex items-center justify-center bg-neutral-900 rounded-lg border border-purple-500/20 group-hover:scale-110 transition-transform">
            <Headphones :size="18" class="text-purple-500" />
          </div>
          <h1 class="text-xl font-bold tracking-tight hidden lg:block">audiobookshelf</h1>
        </div>
      </div>

      <!-- Global Search & Request -->
      <div class="flex items-center gap-4 flex-1 max-w-2xl px-4 md:px-8">
        <!-- Request Button -->
        <button 
          @click="handleRequestClick"
          class="flex items-center gap-2 px-4 py-2 bg-transparent border border-purple-500/30 rounded-full text-[10px] font-black uppercase tracking-widest text-purple-400 hover:bg-purple-500/10 transition-all shrink-0 active:scale-95"
        >
          <PlusSquare :size="14" />
          <span class="hidden sm:inline">Request</span>
        </button>

        <!-- Search Bar -->
        <div class="relative group flex-1 hidden sm:block">
          <input
            type="text"
            placeholder="Search artifacts..."
            :value="search"
            @input="e => emit('update:search', (e.target as HTMLInputElement).value)"
            class="w-full bg-black/40 border border-white/5 rounded-full py-2.5 pl-10 pr-4 text-xs text-white placeholder-neutral-800 focus:border-purple-500/40 outline-none transition-all"
          />
          <Search class="w-4 h-4 text-neutral-800 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-purple-500 transition-colors" />
        </div>
      </div>

      <div class="flex items-center gap-2 md:gap-4">
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
    </header>

    <!-- Side Rail -->
    <aside class="w-20 hidden md:flex h-full fixed left-0 top-16 bg-[#0d0d0d] border-r border-white/5 flex-col items-center z-50">
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
      class="flex-1 h-full pt-16 relative"
      :class="{ 'has-siderail': true }"
    >
      <!-- Removed overflow-y-auto here: children manage their own scrolling -->
      <main 
        class="h-full page-content"
        :class="{ 'streaming': isStreaming }"
      >
        <div class="max-w-7xl mx-auto w-full px-4 md:px-8 py-8 h-full">
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