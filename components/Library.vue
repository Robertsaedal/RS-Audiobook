
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { AuthState, ABSLibraryItem, ABSSeries } from '../types';
import { ABSService } from '../services/absService';
import LibraryLayout, { LibraryTab } from './LibraryLayout.vue';
import Bookshelf from './Bookshelf.vue';
import SeriesShelf from './SeriesShelf.vue';
import SeriesView from './SeriesView.vue';
import RequestPortal from './RequestPortal.vue';
import { ArrowUpDown, Check, Play, Clock } from 'lucide-vue-next';

const props = defineProps<{
  auth: AuthState,
  isStreaming?: boolean
}>();

const emit = defineEmits<{
  (e: 'select-item', item: ABSLibraryItem): void
  (e: 'logout'): void
}>();

const absService = new ABSService(props.auth.serverUrl, props.auth.user?.token || '');

const activeTab = ref<LibraryTab>('HOME');
const searchTerm = ref('');
const sortMethod = ref('addedAt'); 
const desc = ref(1);
const showSortMenu = ref(false);
const selectedSeries = ref<ABSSeries | null>(null);
const isScanning = ref(false);
const selectedCount = ref(0);

const currentlyReading = ref<ABSLibraryItem[]>([]);

const fetchCurrentlyReading = async () => {
  try {
    const { results } = await absService.getLibraryItemsPaged({ 
      limit: 10, 
      sort: 'lastUpdate', 
      desc: 1,
      filter: 'progress' 
    });
    // Filter items with active progress (not finished, some progress made)
    currentlyReading.value = (results || []).filter(i => 
      i.userProgress && 
      !i.userProgress.isFinished && 
      i.userProgress.progress > 0 &&
      i.userProgress.progress < 0.99
    );
  } catch (e) {
    console.error("Failed to fetch currently reading items");
  }
};

const secondsToPretty = (s: number) => {
  if (!s || isNaN(s)) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

onMounted(() => {
  fetchCurrentlyReading();
});

onUnmounted(() => {
  absService.disconnect();
});

const handleSeriesSelect = (series: ABSSeries) => {
  selectedSeries.value = series;
};

const sortOptions = [
  { value: 'addedAt', label: 'Recently Added' },
  { value: 'lastUpdate', label: 'Recent Activity' },
  { value: 'media.metadata.title', label: 'By Title' },
  { value: 'media.metadata.authorName', label: 'By Author' },
] as const;

const handleTabChange = (tab: LibraryTab) => {
  activeTab.value = tab;
  selectedSeries.value = null;
  if (tab === 'HOME') {
    sortMethod.value = 'addedAt';
    desc.value = 1;
    fetchCurrentlyReading();
  }
};

const handleScan = async () => {
  if (isScanning.value) return;
  isScanning.value = true;
  try {
    await absService.scanLibrary();
  } catch (e) {
    console.error("Scan failed", e);
  } finally {
    setTimeout(() => { isScanning.value = false; }, 5000);
  }
};

absService.onProgressUpdate((updated) => {
  const idx = currentlyReading.value.findIndex(i => i.id === updated.itemId);
  if (idx !== -1) {
    currentlyReading.value[idx] = { ...currentlyReading.value[idx], userProgress: updated };
    if (updated.isFinished || updated.progress >= 0.99) currentlyReading.value.splice(idx, 1);
  } else if (!updated.isFinished && updated.progress > 0) {
    fetchCurrentlyReading();
  }
});
</script>

<template>
  <LibraryLayout 
    :activeTab="activeTab" 
    v-model:search="searchTerm"
    :isScanning="isScanning"
    :isStreaming="isStreaming"
    :username="auth.user?.username"
    :selectedCount="selectedCount"
    @tab-change="handleTabChange" 
    @logout="emit('logout')"
    @scan="handleScan"
    @clear-selection="selectedCount = 0"
  >
    <!-- Header -->
    <header v-if="activeTab !== 'REQUEST' && !selectedSeries" class="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 animate-fade-in">
      <div class="space-y-1">
        <h2 class="text-3xl font-black uppercase tracking-tighter text-white">
          {{ activeTab === 'HOME' ? 'Dashboard' : activeTab }}
        </h2>
        <p class="text-[9px] font-black uppercase tracking-[0.4em] text-neutral-600">
          Archives Sector {{ activeTab }}
        </p>
      </div>

      <div class="flex items-center gap-4">
        <div class="relative">
          <button 
            @click="showSortMenu = !showSortMenu"
            class="p-2.5 rounded-md border border-white/5 bg-[#1a1a1a] text-neutral-500 hover:text-white transition-all active:scale-95 flex items-center gap-2"
            :class="{ 'text-purple-400 border-purple-500/20': showSortMenu }"
          >
            <ArrowUpDown :size="16" />
            <span class="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Sort Order</span>
          </button>
          
          <Transition name="fade-pop">
            <div v-if="showSortMenu" class="absolute right-0 top-full mt-2 w-48 bg-[#1a1a1a] border border-white/10 rounded-lg p-1 shadow-2xl z-[70] backdrop-blur-xl">
              <button
                v-for="opt in sortOptions"
                :key="opt.value"
                @click="sortMethod = opt.value; showSortMenu = false;"
                class="w-full flex items-center justify-between px-4 py-3 rounded text-[10px] font-bold uppercase tracking-widest transition-all"
                :class="sortMethod === opt.value ? 'bg-purple-600/20 text-white' : 'text-neutral-500 hover:text-neutral-300'"
              >
                {{ opt.label }}
                <Check v-if="sortMethod === opt.value" :size="12" class="text-purple-500" />
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </header>

    <div class="flex-1 min-h-0">
      <!-- Search results override normal view -->
      <div v-if="searchTerm && !selectedSeries" class="h-full">
        <Bookshelf 
          :absService="absService" 
          :sortMethod="sortMethod" 
          :desc="desc" 
          :search="searchTerm"
          :isStreaming="isStreaming"
          @select-item="emit('select-item', $event)"
        />
      </div>

      <SeriesView 
        v-else-if="selectedSeries"
        :series="selectedSeries"
        :absService="absService"
        @back="selectedSeries = null"
        @select-item="emit('select-item', $event)"
      />

      <template v-else>
        <!-- HOME TAB -->
        <div v-if="activeTab === 'HOME'" class="space-y-16 h-full overflow-y-auto no-scrollbar pb-24">
          
          <!-- Section 1: Currently Reading -->
          <section v-if="currentlyReading.length > 0" class="space-y-6">
             <div class="flex items-center justify-between">
                <h3 class="text-[10px] font-bold uppercase tracking-[0.5em] text-neutral-700">Currently Reading</h3>
             </div>
             
             <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div 
                  v-for="item in currentlyReading" 
                  :key="item.id"
                  class="relative group bg-[#161616] rounded-2xl overflow-hidden border border-white/5 cursor-pointer shadow-xl transition-all hover:border-purple-500/30 flex h-36"
                  @click="emit('select-item', item)"
                >
                  <div class="w-24 h-full shrink-0 relative overflow-hidden">
                    <img :src="absService.getCoverUrl(item.id)" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play :size="20" fill="currentColor" class="text-white translate-x-0.5" />
                    </div>
                  </div>
                  
                  <div class="flex-1 p-5 flex flex-col justify-center gap-3">
                    <div class="space-y-0.5">
                      <h4 class="text-sm font-black uppercase tracking-tight text-white leading-tight line-clamp-1">
                        {{ item.media.metadata.title }}
                      </h4>
                      <p class="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em]">
                        {{ item.media.metadata.authorName }}
                      </p>
                    </div>
                    
                    <div class="space-y-2">
                      <div class="flex justify-between items-center text-[8px] font-bold text-neutral-700 uppercase tracking-widest tabular-nums">
                        <div class="flex items-center gap-1.5">
                          <Clock :size="8" />
                          <span>{{ secondsToPretty(item.media.duration * (1 - (item.userProgress?.progress || 0))) }} Left</span>
                        </div>
                        <span>{{ Math.floor((item.userProgress?.progress || 0) * 100) }}%</span>
                      </div>
                      <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <div class="h-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)] transition-all duration-1000" :style="{ width: `${(item.userProgress?.progress || 0) * 100}%` }" />
                      </div>
                    </div>
                  </div>
                </div>
             </div>
          </section>

          <!-- Section 2: Recently Added -->
          <section class="h-full">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.5em] text-neutral-700 mb-8">Recently Added</h3>
            <Bookshelf 
              :absService="absService" 
              :sortMethod="'addedAt'" 
              :desc="1"
              :isStreaming="isStreaming"
              @select-item="emit('select-item', $event)"
            />
          </section>
        </div>

        <div v-else-if="activeTab === 'LIBRARY'" class="h-full">
          <Bookshelf 
            :absService="absService" 
            :sortMethod="sortMethod" 
            :desc="desc"
            :isStreaming="isStreaming"
            @select-item="emit('select-item', $event)"
          />
        </div>

        <div v-else-if="activeTab === 'SERIES'" class="h-full">
          <SeriesShelf 
            :absService="absService" 
            :sortMethod="sortMethod" 
            :desc="desc"
            @select-series="handleSeriesSelect"
          />
        </div>

        <div v-else-if="activeTab === 'REQUEST'" class="h-full animate-fade-in">
          <RequestPortal />
        </div>
      </template>
    </div>
  </LibraryLayout>
</template>

<style scoped>
.fade-pop-enter-active, .fade-pop-leave-active { transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
.fade-pop-enter-from { opacity: 0; transform: scale(0.95) translateY(10px); }
.fade-pop-leave-to { opacity: 0; transform: scale(1.05); }

.animate-fade-in {
  animation: fade-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
