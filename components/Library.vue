
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { AuthState, ABSLibraryItem, ABSSeries } from '../types';
import { ABSService } from '../services/absService';
import LibraryLayout, { LibraryTab } from './LibraryLayout.vue';
import Bookshelf from './Bookshelf.vue';
import SeriesShelf from './SeriesShelf.vue';
import SeriesView from './SeriesView.vue';
import RequestPortal from './RequestPortal.vue';
import BookCard from './BookCard.vue';
import SeriesCard from './SeriesCard.vue';
import { ArrowUpDown, Check, Play, Clock, ChevronRight } from 'lucide-vue-next';

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

const currentlyReading = ref<ABSLibraryItem[]>([]);
const recentlyAdded = ref<ABSLibraryItem[]>([]);
const recentSeries = ref<ABSSeries[]>([]);

const fetchDashboardData = async () => {
  try {
    // 1. Continue Listening
    const { results: reading } = await absService.getLibraryItemsPaged({ 
      limit: 15, sort: 'lastUpdate', desc: 1, filter: 'progress' 
    });
    currentlyReading.value = reading.filter(i => 
      i.userProgress && !i.userProgress.isFinished && i.userProgress.progress > 0
    );

    // 2. Recently Added
    const { results: added } = await absService.getLibraryItemsPaged({ 
      limit: 20, sort: 'addedAt', desc: 1 
    });
    recentlyAdded.value = added;

    // 3. Recent Series
    const { results: series } = await absService.getLibrarySeriesPaged({ 
      limit: 12, sort: 'addedAt', desc: 1 
    });
    recentSeries.value = series;
  } catch (e) {
    console.error("Dashboard hydration failed", e);
  }
};

onMounted(() => {
  fetchDashboardData();
});

onUnmounted(() => {
  absService.disconnect();
});

const handleTabChange = (tab: LibraryTab) => {
  activeTab.value = tab;
  selectedSeries.value = null;
  if (tab === 'HOME') fetchDashboardData();
};

absService.onProgressUpdate((updated) => {
  const idx = currentlyReading.value.findIndex(i => i.id === updated.itemId);
  if (idx !== -1) {
    currentlyReading.value[idx] = { ...currentlyReading.value[idx], userProgress: updated };
    if (updated.isFinished) currentlyReading.value.splice(idx, 1);
  } else if (!updated.isFinished && updated.progress > 0) {
    fetchDashboardData();
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
    @tab-change="handleTabChange" 
    @logout="emit('logout')"
  >
    <div class="flex-1 min-h-0">
      <!-- Search Overlay -->
      <div v-if="searchTerm && !selectedSeries" class="h-full">
        <Bookshelf 
          :absService="absService" :sortMethod="sortMethod" :desc="desc" :search="searchTerm"
          @select-item="emit('select-item', $event)"
        />
      </div>

      <SeriesView 
        v-else-if="selectedSeries"
        :series="selectedSeries" :absService="absService"
        @back="selectedSeries = null"
        @select-item="emit('select-item', $event)"
      />

      <template v-else>
        <!-- HOME DASHBOARD: Horizontal Shelves on Wood -->
        <div v-if="activeTab === 'HOME'" class="h-full bookshelf-bg overflow-y-auto custom-scrollbar -mx-4 md:-mx-8 px-4 md:px-8 pt-4 pb-32">
          
          <!-- Continue Listening Shelf -->
          <section v-if="currentlyReading.length > 0" class="shelf-row">
            <div class="shelf-tag">
              <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Continue Listening</span>
            </div>
            <div class="flex gap-6 overflow-x-auto no-scrollbar pb-2">
              <div v-for="item in currentlyReading" :key="item.id" class="w-36 shrink-0">
                <BookCard 
                  :item="item" 
                  :coverUrl="absService.getCoverUrl(item.id)" 
                  @click="emit('select-item', item)" 
                />
              </div>
            </div>
          </section>

          <!-- Recently Added Shelf -->
          <section class="shelf-row">
            <div class="shelf-tag">
              <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Recently Added</span>
            </div>
            <div class="flex gap-6 overflow-x-auto no-scrollbar pb-2">
              <div v-for="item in recentlyAdded" :key="item.id" class="w-36 shrink-0">
                <BookCard 
                  :item="item" 
                  :coverUrl="absService.getCoverUrl(item.id)" 
                  @click="emit('select-item', item)" 
                />
              </div>
            </div>
          </section>

          <!-- Recent Series Shelf -->
          <section v-if="recentSeries.length > 0" class="shelf-row">
            <div class="shelf-tag">
              <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Recent Series</span>
            </div>
            <div class="flex gap-12 overflow-x-auto no-scrollbar pb-2 pl-4">
              <div v-for="series in recentSeries" :key="series.id" class="w-56 shrink-0">
                <SeriesCard 
                  :series="series" 
                  :coverUrl="absService.getCoverUrl(series.books?.[0]?.id || '')"
                  @click="selectedSeries = series"
                />
              </div>
            </div>
          </section>

        </div>

        <!-- Vertial Grid Tabs -->
        <div v-else-if="activeTab === 'LIBRARY'" class="h-full">
          <Bookshelf :absService="absService" :sortMethod="sortMethod" :desc="desc" @select-item="emit('select-item', $event)" />
        </div>
        <div v-else-if="activeTab === 'SERIES'" class="h-full">
          <SeriesShelf :absService="absService" :sortMethod="sortMethod" :desc="desc" @select-series="selectedSeries = $event" />
        </div>
        <div v-else-if="activeTab === 'REQUEST'" class="h-full">
          <RequestPortal />
        </div>
      </template>
    </div>
  </LibraryLayout>
</template>

<style scoped>
.animate-fade-in {
  animation: fade-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
