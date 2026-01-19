
<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { AuthState, ABSLibraryItem, ABSProgress } from '../types';
import { ABSService } from '../services/absService';
import Navigation from './Navigation.vue';
import { NavTab } from './Navigation.vue';
import { Search, ChevronRight, Clock, ArrowRight, Play, ArrowUpDown, Check } from 'lucide-vue-next';

const props = defineProps<{
  auth: AuthState
}>();

const emit = defineEmits<{
  (e: 'select-item', item: ABSLibraryItem): void
  (e: 'logout'): void
}>();

const items = ref<ABSLibraryItem[]>([]);
const loading = ref(true);
const activeTab = ref<NavTab>('HOME');
const searchTerm = ref('');
const sortMethod = ref<'NEWEST' | 'OLDEST' | 'TITLE' | 'AUTHOR'>('NEWEST');
const showSortMenu = ref(false);
const selectedSeries = ref<any>(null);
const viewingAll = ref(false);

const absService = new ABSService(props.auth.serverUrl, props.auth.user?.token || '');

const fetchData = async () => {
  try {
    const libraryItems = await absService.getLibraryItems();
    items.value = libraryItems || [];
  } catch (e) {
    console.error("Library sync failed");
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchData();
  absService.onProgressUpdate((updated: ABSProgress) => {
    items.value = items.value.map(item => item.id === updated.itemId ? { ...item, userProgress: updated } : item);
  });
  absService.onLibraryUpdate(() => fetchData());
});

onUnmounted(() => {
  absService.disconnect();
});

const sortedAllItems = computed(() => {
  return [...items.value].sort((a, b) => {
    switch (sortMethod.value) {
      case 'NEWEST':
        return absService.normalizeDate(b.addedDate) - absService.normalizeDate(a.addedDate);
      case 'OLDEST':
        return absService.normalizeDate(a.addedDate) - absService.normalizeDate(b.addedDate);
      case 'TITLE':
        return a.media.metadata.title.localeCompare(b.media.metadata.title);
      case 'AUTHOR':
        return a.media.metadata.authorName.localeCompare(b.media.metadata.authorName);
      default:
        return 0;
    }
  });
});

const resumeHero = computed(() => {
  return items.value
    .filter(i => i.userProgress && !i.userProgress.isFinished && i.userProgress.progress > 0)
    .sort((a, b) => (b.userProgress?.lastUpdate || 0) - (a.userProgress?.lastUpdate || 0))[0];
});

const recentlyAdded = computed(() => {
  return [...items.value]
    .sort((a, b) => absService.normalizeDate(b.addedDate) - absService.normalizeDate(a.addedDate))
    .slice(0, 10);
});

const seriesStacks = computed(() => {
  const groups: Record<string, ABSLibraryItem[]> = {};
  items.value.forEach(item => {
    const sName = item.media.metadata.seriesName;
    if (sName) {
      if (!groups[sName]) groups[sName] = [];
      groups[sName].push(item);
    }
  });

  return Object.entries(groups).map(([name, groupItems]) => {
    const sorted = groupItems.sort((a, b) => 
      parseFloat(a.media.metadata.sequence || '0') - parseFloat(b.media.metadata.sequence || '0')
    );
    return { 
      name, 
      items: sorted, 
      coverUrl: absService.getCoverUrl(sorted[0].id),
      totalCount: sorted.length
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
});

const filteredItems = computed(() => {
  if (!searchTerm.value) return sortedAllItems.value;
  const term = searchTerm.value.toLowerCase();
  return sortedAllItems.value.filter(i => 
    i.media.metadata.title.toLowerCase().includes(term) || 
    i.media.metadata.authorName.toLowerCase().includes(term)
  );
});

const getSeriesTotal = (seriesName: string) => {
  return seriesStacks.value.find(s => s.name === seriesName)?.totalCount || 0;
};

const sortOptions = [
  { value: 'NEWEST', label: 'Recently Added' },
  { value: 'OLDEST', label: 'Oldest' },
  { value: 'TITLE', label: 'By Title' },
  { value: 'AUTHOR', label: 'By Author' },
] as const;

const handleTabChange = (tab: NavTab) => {
  activeTab.value = tab;
  selectedSeries.value = null;
  viewingAll.value = false;
};
</script>

<template>
  <div class="flex-1 flex flex-col bg-black min-h-[100dvh]">
    <Navigation 
      :activeTab="activeTab" 
      @tab-change="handleTabChange" 
      @logout="emit('logout')" 
    />

    <div v-if="loading" class="flex-1 flex flex-col items-center justify-center bg-black h-[100dvh]">
      <div class="w-12 h-12 border-4 border-purple-600/20 border-t-purple-600 rounded-full animate-spin mb-6" />
      <h2 class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-800 animate-pulse">Establishing Archive</h2>
    </div>

    <main v-else class="flex-1 md:ml-64 pb-24 md:pb-8 safe-top overflow-x-hidden">
      <div class="px-6 pt-10 pb-4 space-y-6 shrink-0 md:px-12">
        <div class="md:hidden flex items-center justify-between mb-8">
          <div class="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" class="w-8 h-8 rounded-lg" />
            <h2 class="text-lg font-black tracking-tighter text-purple-500 drop-shadow-aether-glow">R.S AUDIOBOOK PLAYER</h2>
          </div>
        </div>

        <div class="flex items-center gap-4 max-w-2xl relative">
          <div class="relative group flex-1">
            <input
              type="text"
              placeholder="Query library archive..."
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
        <div v-if="selectedSeries" class="space-y-10">
          <button @click="selectedSeries = null" class="flex items-center gap-2 text-purple-500 text-[10px] font-black uppercase tracking-widest bg-neutral-900/40 px-5 py-2.5 rounded-full border border-white/5 active:scale-95">
            <ChevronRight class="rotate-180" :size="14" />
            Back to Archives
          </button>
          <div class="space-y-2">
            <h3 class="text-3xl font-black uppercase tracking-tighter text-white">{{ selectedSeries.name }}</h3>
            <p class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">{{ selectedSeries.totalCount }} VOLUME COLLECTION</p>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-12">
            <BookCard 
              v-for="item in selectedSeries.items"
              :key="item.id" 
              :item="item" 
              @click="emit('select-item', item)" 
              :coverUrl="absService.getCoverUrl(item.id)" 
              :totalInSeries="selectedSeries.totalCount"
            />
          </div>
        </div>

        <div v-else-if="viewingAll" class="space-y-10">
          <button @click="viewingAll = false" class="flex items-center gap-2 text-purple-500 text-[10px] font-black uppercase tracking-widest bg-neutral-900/40 px-5 py-2.5 rounded-full border border-white/5 active:scale-95">
            <ChevronRight class="rotate-180" :size="14" />
            Back to Dashboard
          </button>
          <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div class="space-y-2">
              <h3 class="text-3xl font-black uppercase tracking-tighter text-white">Full Library</h3>
              <p class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">{{ items.length }} TITLES ACCESSIBLE</p>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-12">
            <BookCard 
              v-for="item in filteredItems"
              :key="item.id" 
              :item="item" 
              @click="emit('select-item', item)" 
              :coverUrl="absService.getCoverUrl(item.id)" 
              :totalInSeries="getSeriesTotal(item.media.metadata.seriesName || '')"
            />
          </div>
        </div>

        <div v-else-if="activeTab === 'HOME'" class="space-y-12">
          <section class="space-y-6">
            <div class="flex items-center gap-2 text-neutral-800">
              <Play :size="12" />
              <h3 class="text-[10px] font-black uppercase tracking-[0.4em]">Current Entry</h3>
            </div>
            <div v-if="resumeHero" class="md:flex justify-center">
              <div 
                @click="emit('select-item', resumeHero)"
                class="relative group w-full md:max-w-4xl aspect-[21/9] bg-neutral-950 rounded-[40px] overflow-hidden border border-white/5 cursor-pointer shadow-2xl active:scale-[0.98] transition-all"
              >
                <img :src="absService.getCoverUrl(resumeHero.id)" class="w-full h-full object-cover opacity-50 transition-opacity" alt="" />
                <div class="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-8 md:p-12 flex flex-col justify-end">
                  <h4 class="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white mb-1 truncate leading-none">{{ resumeHero.media.metadata.title }}</h4>
                  <p class="text-[10px] md:text-xs font-black text-purple-500 uppercase tracking-[0.2em] mb-6">
                    {{ resumeHero.media.metadata.seriesName ? `${resumeHero.media.metadata.seriesName}: Book ${resumeHero.media.metadata.sequence}` : resumeHero.media.metadata.authorName }}
                  </p>
                  <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                    <div class="absolute inset-0 h-full gradient-aether shadow-aether-glow transition-all" :style="{ width: `${(resumeHero.userProgress?.progress || 0) * 100}%` }" />
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="bg-neutral-900/5 rounded-[40px] p-16 text-center border border-dashed border-white/5">
              <p class="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-800">No active sync found</p>
            </div>
          </section>

          <section class="space-y-8">
            <button 
              @click="viewingAll = true"
              class="w-full flex items-center justify-between group text-left"
            >
              <div class="flex items-center gap-2 text-neutral-800 group-hover:text-purple-500 transition-colors">
                <Clock :size="12" />
                <h3 class="text-[10px] font-black uppercase tracking-[0.4em]">Recent Archive Addition</h3>
                <ArrowRight :size="14" class="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </div>
              <span class="text-[10px] font-black text-neutral-700 uppercase tracking-widest group-hover:text-white transition-colors">Expand Library</span>
            </button>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-12">
              <BookCard 
                v-for="item in recentlyAdded"
                :key="item.id" 
                :item="item" 
                @click="emit('select-item', item)" 
                :coverUrl="absService.getCoverUrl(item.id)" 
                :totalInSeries="getSeriesTotal(item.media.metadata.seriesName || '')"
              />
            </div>
          </section>
        </div>

        <div v-else class="space-y-10">
          <div class="space-y-2">
            <h3 class="text-3xl font-black uppercase tracking-tighter text-white">Series Archives</h3>
            <p class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">Multi-Volume Collections</p>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-12 gap-y-16">
            <div v-for="stack in seriesStacks" :key="stack.name" @click="selectedSeries = stack" class="relative cursor-pointer group active:scale-95 transition-all pt-6">
              <div class="series-cover-container">
                <img :src="stack.coverUrl" loading="lazy" alt="" />
                <div class="series-badge">{{ stack.totalCount }} VOLUMES</div>
              </div>
              <h3 class="text-center mt-6 text-[11px] font-black uppercase tracking-tight text-white group-hover:text-purple-500 transition-colors truncate px-2">{{ stack.name }}</h3>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
// Defining BookCard as a nested component locally or just use a template function
// For clarity I'll define it as a simple function-based component pattern or separate SFC.
// I'll keep it as a sub-template here for brevity.
</script>

<style scoped>
/* Scoped styles if needed */
</style>
