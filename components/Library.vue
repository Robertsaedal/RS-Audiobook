
<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted, watch } from 'vue';
import { AuthState, ABSLibraryItem, ABSProgress } from '../types';
import { ABSService } from '../services/absService';
import Navigation from './Navigation.vue';
import Bookshelf from './Bookshelf.vue';
import BookCard from './BookCard.vue';
import { NavTab } from './Navigation.vue';
import { Search, ChevronRight, Clock, ArrowRight, Play, ArrowUpDown, Check, LayoutGrid } from 'lucide-vue-next';

const props = defineProps<{
  auth: AuthState,
  isStreaming?: boolean
}>();

const emit = defineEmits<{
  (e: 'select-item', item: ABSLibraryItem): void
  (e: 'logout'): void
}>();

const absService = new ABSService(props.auth.serverUrl, props.auth.user?.token || '');

const activeTab = ref<NavTab>('HOME');
const searchTerm = ref('');
const sortMethod = ref('ADDEDDATE');
const desc = ref(1);
const showSortMenu = ref(false);
const selectedSeries = ref<any>(null);
const seriesItems = ref<ABSLibraryItem[]>([]);
const viewingAll = ref(false);

const resumeHero = ref<ABSLibraryItem | null>(null);

const fetchResume = async () => {
  try {
    const { results } = await absService.getLibraryItemsPaged({ limit: 10, sort: 'lastUpdate', desc: 1 });
    resumeHero.value = results.find(i => i.userProgress && !i.userProgress.isFinished && i.userProgress.progress > 0) || null;
  } catch (e) {
    console.error("Failed to fetch resume item");
  }
};

onMounted(() => {
  fetchResume();
});

onUnmounted(() => {
  absService.disconnect();
});

const handleSeriesSelect = async (stack: any) => {
  selectedSeries.value = stack;
  seriesItems.value = await absService.getSeriesItems(stack.id || stack.name);
};

const sortOptions = [
  { value: 'ADDEDDATE', label: 'Recently Added' },
  { value: 'LASTUPDATE', label: 'Recent Activity' },
  { value: 'TITLE', label: 'By Title' },
  { value: 'AUTHOR', label: 'By Author' },
] as const;

const handleTabChange = (tab: NavTab) => {
  activeTab.value = tab;
  selectedSeries.value = null;
  viewingAll.value = false;
};

// Listen for updates to hero if playing
absService.onProgressUpdate((updated) => {
  if (resumeHero.value?.id === updated.itemId) {
    resumeHero.value = { ...resumeHero.value, userProgress: updated };
  }
});
</script>

<template>
  <div class="flex-1 flex flex-col bg-black min-h-[100dvh]">
    <Navigation 
      :activeTab="activeTab" 
      @tab-change="handleTabChange" 
      @logout="emit('logout')" 
    />

    <main class="flex-1 md:ml-64 pb-24 md:pb-8 safe-top overflow-x-hidden">
      <!-- Search & Sort Header -->
      <div class="px-6 pt-10 pb-4 space-y-6 shrink-0 md:px-12">
        <div class="md:hidden flex items-center justify-between mb-8">
          <div class="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" class="w-8 h-8 rounded-lg" />
            <h2 class="text-lg font-black tracking-tighter text-purple-500 drop-shadow-aether-glow">ARCHIVE</h2>
          </div>
        </div>

        <div class="flex items-center gap-4 max-w-2xl relative">
          <div class="relative group flex-1">
            <input
              type="text"
              placeholder="Search artifacts..."
              v-model="searchTerm"
              class="w-full bg-neutral-900/50 border border-white/5 rounded-[24px] py-4 pl-14 pr-6 text-sm text-white placeholder-neutral-800 transition-all focus:ring-1 focus:ring-purple-600/40 outline-none backdrop-blur-sm"
            />
            <Search class="w-5 h-5 text-neutral-800 absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-purple-500 transition-colors" />
          </div>
          
          <div class="relative">
            <button 
              @click="showSortMenu = !showSortMenu"
              class="p-4 rounded-[24px] border border-white/5 bg-neutral-900/50 backdrop-blur-sm transition-all active:scale-90"
              :class="showSortMenu ? 'text-purple-500 border-purple-600/40' : 'text-neutral-500'"
            >
              <ArrowUpDown :size="20" />
            </button>
            
            <template v-if="showSortMenu">
              <div class="fixed inset-0 z-[60]" @click="showSortMenu = false" />
              <div class="absolute right-0 top-full mt-2 w-56 bg-neutral-950 border border-white/10 rounded-[28px] p-2 shadow-2xl z-[70] animate-fade-in backdrop-blur-xl">
                <button
                  v-for="opt in sortOptions"
                  :key="opt.value"
                  @click="sortMethod = opt.value; showSortMenu = false;"
                  class="w-full flex items-center justify-between px-6 py-4 rounded-[20px] transition-all"
                  :class="sortMethod === opt.value ? 'bg-purple-600/10 text-white' : 'text-neutral-500 hover:text-neutral-300'"
                >
                  <span class="text-[11px] font-black uppercase tracking-widest">{{ opt.label }}</span>
                  <Check v-if="sortMethod === opt.value" :size="14" class="text-purple-500" />
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="px-6 py-4 md:px-12 animate-fade-in max-w-[1600px] mx-auto">
        
        <!-- Search Results Overide -->
        <div v-if="searchTerm" class="space-y-10">
          <div class="space-y-2">
            <h3 class="text-3xl font-black uppercase tracking-tighter text-white">Searching Archive</h3>
            <p class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">QUERYING PORTAL...</p>
          </div>
          <Bookshelf 
            :absService="absService" 
            :sortMethod="sortMethod" 
            :desc="desc" 
            :search="searchTerm"
            :isStreaming="isStreaming"
            @select-item="emit('select-item', $event)"
          />
        </div>

        <!-- Series View -->
        <div v-else-if="selectedSeries" class="space-y-10">
          <button @click="selectedSeries = null" class="flex items-center gap-2 text-purple-500 text-[10px] font-black uppercase tracking-widest bg-neutral-900/40 px-5 py-2.5 rounded-full border border-white/5 active:scale-95">
            <ChevronRight class="rotate-180" :size="14" />
            Back to Archives
          </button>
          <div class="space-y-2">
            <h3 class="text-3xl font-black uppercase tracking-tighter text-white">{{ selectedSeries.name }}</h3>
            <p class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">COLLECTION SEGMENTS</p>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-12">
            <BookCard 
              v-for="item in seriesItems"
              :key="item.id" 
              :item="item" 
              @click="emit('select-item', item)" 
              :coverUrl="absService.getCoverUrl(item.id)" 
            />
          </div>
        </div>

        <!-- Dashboard View -->
        <div v-else-if="activeTab === 'HOME'" class="space-y-12">
          <!-- Hero Section -->
          <section class="space-y-6">
            <div class="flex items-center gap-2 text-neutral-800">
              <Play :size="12" />
              <h3 class="text-[10px] font-black uppercase tracking-[0.4em]">RESUME LINK</h3>
            </div>
            <div v-if="resumeHero" class="md:flex justify-center">
              <div 
                @click="emit('select-item', resumeHero!)"
                class="relative group w-full md:max-w-4xl aspect-[21/9] bg-neutral-950 rounded-[40px] overflow-hidden border border-white/5 cursor-pointer shadow-2xl active:scale-[0.98] transition-all"
              >
                <img :src="absService.getCoverUrl(resumeHero.id)" class="w-full h-full object-cover opacity-50 transition-opacity" alt="" />
                <div class="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-8 md:p-12 flex flex-col justify-end">
                  <h4 class="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white mb-1 truncate leading-none">{{ resumeHero.media.metadata.title }}</h4>
                  <p class="text-[10px] md:text-xs font-black text-purple-500 uppercase tracking-[0.2em] mb-6">
                    {{ resumeHero.media.metadata.authorName }}
                  </p>
                  <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                    <div class="absolute inset-0 h-full gradient-aether shadow-aether-glow transition-all" :style="{ width: `${(resumeHero.userProgress?.progress || 0) * 100}%` }" />
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="bg-neutral-900/5 rounded-[40px] p-16 text-center border border-dashed border-white/5">
              <p class="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-800">No active link established</p>
            </div>
          </section>

          <!-- Infinite Library -->
          <section class="space-y-8">
            <div class="flex items-center gap-2 text-neutral-800">
              <LayoutGrid :size="12" />
              <h3 class="text-[10px] font-black uppercase tracking-[0.4em]">ARCHIVE REPOSITORY</h3>
            </div>
            <Bookshelf 
              :absService="absService" 
              :sortMethod="sortMethod" 
              :desc="desc" 
              :isStreaming="isStreaming"
              @select-item="emit('select-item', $event)"
            />
          </section>
        </div>
      </div>
    </main>
  </div>
</template>
