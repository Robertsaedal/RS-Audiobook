
<script setup lang="ts">
import { computed, ref } from 'vue';
import { 
  Home, BookOpen, Layers, User,
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

const version = "5.2.0";

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
  <div class="flex h-screen w-full bg-[#0d0d0d] text-white overflow-hidden relative">
    
    <!-- Top Appbar (Reference: Appbar.txt refined) -->
    <header class="h-16 w-full fixed top-0 left-0 right-0 bg-[#1a1a1a] z-[60] px-4 md:px-6 flex items-center justify-between border-b border-white/5">
      <div class="flex items-center gap-4">
        <div class="flex items-center cursor-pointer group" @click="emit('tab-change', 'HOME')">
          <img src="/logo.png" alt="ABS" class="w-8 h-8 mr-3 group-hover:scale-110 transition-transform" />
          <h1 class="text-xl font-bold tracking-tight hidden lg:block hover:underline">audiobookshelf</h1>
        </div>
      </div>

      <!-- Global Search & Request (Center-ish Alignment) -->
      <div class="flex items-center gap-4 flex-1 max-w-2xl px-8 ml-4">
        <!-- Request Button (Ghost Style / Purple Border) -->
        <button 
          @click="handleRequestClick"
          class="flex items-center gap-2 px-4 py-2 bg-transparent border border-purple-500 rounded-md text-[10px] font-black uppercase tracking-widest text-purple-400 hover:bg-purple-500/10 transition-all shrink-0 active:scale-95"
        >
          <PlusSquare :size="14" />
          <span>Request</span>
        </button>

        <!-- Search Bar -->
        <div class="relative group flex-1 hidden sm:block">
          <input
            type="text"
            placeholder="Search artifacts..."
            :value="search"
            @input="e => emit('update:search', (e.target as HTMLInputElement).value)"
            class="w-full bg-[#0d0d0d] border border-white/5 rounded-md py-2.5 pl-10 pr-4 text-xs text-white placeholder-neutral-800 focus:border-purple-500/40 outline-none transition-all"
          />
          <Search class="w-4 h-4 text-neutral-800 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-purple-500 transition-colors" />
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- User Profile -->
        <div 
          @click="emit('logout')"
          class="relative flex items-center gap-3 bg-[#262626] border border-white/10 rounded-md px-3 py-2 cursor-pointer hover:bg-neutral-700 transition-all ml-2"
        >
          <span class="text-sm font-medium hidden md:block">{{ username || 'User' }}</span>
          <User :size="18" class="text-neutral-300" />
        </div>
      </div>

      <!-- Batch Selection Toolbar -->
      <Transition name="fade">
        <div v-if="selectedCount && selectedCount > 0" class="absolute inset-0 bg-[#9D50BB] flex items-center px-8 z-[70]">
          <h1 class="text-lg md:text-2xl font-bold">{{ selectedCount }} Items Selected</h1>
          <div class="grow" />
          <div class="flex items-center gap-4">
            <button @click="emit('clear-selection')" class="p-2 hover:bg-black/10 rounded transition-colors">
              <X :size="32" />
            </button>
          </div>
        </div>
      </Transition>
    </header>

    <!-- Side Rail (Reference: SideRail.txt - Home, Library, Series only) -->
    <aside class="w-20 hidden md:flex h-full fixed left-0 top-16 bg-[#0f0f0f] border-r border-white/5 flex-col items-center z-50 box-shadow-side">
      <div id="siderail-buttons-container" class="w-full flex-1 overflow-y-auto no-scrollbar">
        <button
          v-for="item in navItems"
          :key="item.id"
          @click="emit('tab-change', item.id)"
          class="w-full h-20 flex flex-col items-center justify-center text-white border-b border-white/5 hover:bg-white/5 transition-all relative group"
          :class="activeTab === item.id ? 'bg-purple-600/10' : 'opacity-60 hover:opacity-100'"
        >
          <component :is="item.icon" :size="24" :class="activeTab === item.id ? 'text-purple-400' : ''" />
          <p class="pt-1.5 text-center text-[10px] font-medium leading-none tracking-wide">{{ item.label }}</p>
          <div v-show="activeTab === item.id" class="h-full w-0.5 bg-yellow-400 absolute top-0 left-0" />
        </button>
      </div>

      <!-- Bottom Side Tools -->
      <div class="w-full border-t border-white/5 bg-[#0f0f0f] py-4 flex flex-col items-center gap-4">
        <button 
          @click="emit('scan')"
          class="flex flex-col items-center group relative"
          :class="isScanning ? 'text-purple-400' : 'text-neutral-500 hover:text-white'"
        >
          <RotateCw :size="20" :class="{ 'animate-spin': isScanning }" />
          <span class="text-[8px] mt-1 font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Sync</span>
          <div v-if="isScanning" class="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full animate-ping" />
        </button>

        <div class="text-center px-1">
          <p class="text-[8px] font-mono text-neutral-600 leading-none">v{{ version }}</p>
          <p class="text-[8px] font-mono text-neutral-700 leading-none mt-1 italic">Source</p>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div 
      id="app-content" 
      class="flex-1 h-full pt-16 relative"
      :class="{ 'has-siderail': true }"
    >
      <main 
        class="h-full overflow-y-auto custom-scrollbar page-content"
        :class="{ 'streaming': isStreaming }"
      >
        <div class="max-w-7xl mx-auto w-full px-4 md:px-8 py-8 min-h-full">
          <!-- Mobile Search (Visible only on small screens) -->
          <div class="sm:hidden relative group mb-8">
            <input
              type="text"
              placeholder="Search artifacts..."
              :value="search"
              @input="e => emit('update:search', (e.target as HTMLInputElement).value)"
              class="w-full bg-[#1a1a1a] border border-white/5 rounded-md py-3 pl-12 pr-4 text-xs text-white outline-none focus:border-purple-500/40 transition-all"
            />
            <Search class="w-4 h-4 text-neutral-800 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-purple-500 transition-colors" />
          </div>

          <slot></slot>
        </div>
      </main>
    </div>

    <!-- Mobile Navigation Bar -->
    <nav class="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#1a1a1a] border-t border-white/5 flex justify-around items-center z-[60] safe-bottom">
      <button 
        v-for="item in navItems" 
        :key="item.id"
        @click="emit('tab-change', item.id)"
        class="flex flex-col items-center gap-1"
        :class="activeTab === item.id ? 'text-purple-400' : 'text-neutral-500'"
      >
        <component :is="item.icon" :size="20" />
        <span class="text-[9px] font-bold">{{ item.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

#siderail-buttons-container {
  max-height: calc(100vh - 64px - 80px);
}

.shadow-aether-glow {
  filter: drop-shadow(0 0 5px rgba(168, 85, 247, 0.5));
}
</style>
