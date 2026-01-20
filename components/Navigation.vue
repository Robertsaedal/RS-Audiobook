<script setup lang="ts">
import { Home, Layers, LogOut, Activity, PlusSquare, Headphones } from 'lucide-vue-next';

export type NavTab = 'HOME' | 'SERIES' | 'REQUEST';

const props = defineProps<{
  activeTab: NavTab
}>();

const emit = defineEmits<{
  (e: 'tab-change', tab: NavTab): void,
  (e: 'logout'): void
}>();

const navItems = [
  { id: 'HOME' as NavTab, icon: Home, label: 'Home' },
  { id: 'SERIES' as NavTab, icon: Layers, label: 'Series' },
  { id: 'REQUEST' as NavTab, icon: PlusSquare, label: 'Request' },
];
</script>

<template>
  <div>
    <!-- Sidebar - Desktop -->
    <aside class="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 bg-neutral-950 border-r border-white/5 z-50 p-8">
      <div class="mb-12">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-purple-900/20 bg-neutral-900 flex items-center justify-center border border-purple-500/20">
            <Headphones :size="20" class="text-purple-500" />
          </div>
          <div>
            <h2 class="text-sm font-black tracking-tight text-white leading-tight">R.S AUDIOBOOK</h2>
            <div class="flex items-center gap-2">
              <Activity :size="8" class="text-purple-500" />
              <p class="text-[7px] uppercase tracking-[0.4em] text-neutral-500 font-black">PLAYER V5.2</p>
            </div>
          </div>
        </div>
      </div>

      <nav class="flex-1 space-y-2">
        <button
          v-for="item in navItems"
          :key="item.id"
          @click="emit('tab-change', item.id)"
          class="w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-black text-[11px] uppercase tracking-widest"
          :class="activeTab === item.id ? 'bg-purple-600/10 text-white border border-purple-600/20' : 'text-neutral-500 hover:text-white hover:bg-neutral-900'"
        >
          <component :is="item.icon" :size="18" :class="activeTab === item.id ? 'text-purple-500' : ''" />
          {{ item.label }}
        </button>
      </nav>

      <button 
        @click="emit('logout')"
        class="flex items-center gap-4 px-6 py-4 rounded-2xl text-neutral-600 hover:text-red-500 transition-colors font-black text-[11px] uppercase tracking-widest mt-auto border border-transparent hover:border-red-500/20"
      >
        <LogOut :size="18" />
        Sign Out
      </button>
    </aside>

    <!-- Bottom Bar - Mobile -->
    <nav class="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-neutral-950/90 backdrop-blur-xl border-t border-white/5 flex justify-around items-center px-6 z-50 safe-bottom">
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="emit('tab-change', item.id)"
        class="flex flex-col items-center gap-1 transition-all"
        :class="activeTab === item.id ? 'text-purple-500' : 'text-neutral-600'"
      >
        <div class="p-2 rounded-xl transition-all" :class="activeTab === item.id ? 'bg-purple-600/10' : ''">
          <component :is="item.icon" :size="22" />
        </div>
        <span class="text-[8px] font-black uppercase tracking-tighter">{{ item.label }}</span>
      </button>
      <button @click="emit('logout')" class="flex flex-col items-center gap-1 text-neutral-600">
        <div class="p-2">
          <LogOut :size="22" />
        </div>
        <span class="text-[8px] font-black uppercase tracking-tighter">Exit</span>
      </button>
    </nav>
  </div>
</template>