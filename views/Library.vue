<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { AuthState, ABSLibraryItem, ABSSeries, ABSProgress } from '../types';
import { ABSService } from '../services/absService';
import LibraryLayout, { LibraryTab } from '../components/LibraryLayout.vue';
import Bookshelf from '../components/Bookshelf.vue';
import SeriesShelf from '../components/SeriesShelf.vue';
import SeriesView from './SeriesView.vue';
import RequestPortal from '../components/RequestPortal.vue';
import BookCard from '../components/BookCard.vue';
import SeriesCard from '../components/SeriesCard.vue';
import ContinueListening from '../components/ContinueListening.vue';

const props = defineProps<{
  auth: AuthState,
  isStreaming?: boolean,
  initialSeriesId?: string | null
}>();

const emit = defineEmits<{
  (e: 'select-item', item: ABSLibraryItem): void
  (e: 'logout'): void
  (e: 'clear-initial-series'): void
}>();

const absService = new ABSService(props.auth.serverUrl, props.auth.user?.token || '');

const activeTab = ref<LibraryTab>('HOME');
const searchTerm = ref('');
const sortMethod = ref('addedAt'); 
const desc = ref(1);
const selectedSeries = ref<ABSSeries | null>(null);
const isScanning = ref(false);

const currentlyReading = ref<ABSLibraryItem[]>([]);
const recentlyAdded = ref<ABSLibraryItem[]>([]);
const recentSeries = ref<ABSSeries[]>([]);

const fetchDashboardData = async () => {
  try {
    const { results: reading } = await absService.getLibraryItemsPaged({ 
      limit: 15, sort: 'lastUpdate', desc: 1, filter: 'progress' 
    });
    currentlyReading.value = reading.filter(i => 
      i.userProgress && !i.userProgress.isFinished && i.userProgress.progress > 0
    );

    const { results: added } = await absService.getLibraryItemsPaged({ 
      limit: 20, sort: 'addedAt', desc: 1 
    });
    recentlyAdded.value = added;

    const { results: series } = await absService.getLibrarySeriesPaged({ 
      limit: 12, sort: 'addedAt', desc: 1 
    });
    recentSeries.value = series;
  } catch (e) {
    console.error("Dashboard hydration failed", e);
  }
};

const handleJumpToSeries = async (seriesId: string) => {
  const { results: allSeries } = await absService.getLibrarySeriesPaged({ limit: 100 });
  const target = allSeries.find(s => s.id === seriesId);
  if (target) {
    selectedSeries.value = target;
    activeTab.value = 'SERIES';
  }
  emit('clear-initial-series');
};

onMounted(() => {
  fetchDashboardData();
  
  if (props.initialSeriesId) {
    handleJumpToSeries(props.initialSeriesId);
  }

  absService.onProgressUpdate((updated: ABSProgress) => {
    const readingIdx = currentlyReading.value.findIndex(i => i.id === updated.itemId);
    if (readingIdx !== -1) {
      currentlyReading.value[readingIdx] = { 
        ...currentlyReading.value[readingIdx], 
        userProgress: updated 
      };
      if (updated.isFinished) currentlyReading.value.splice(readingIdx, 1);
    } else if (!updated.isFinished && updated.progress > 0) {
      fetchDashboardData();
    }

    const addedIdx = recentlyAdded.value.findIndex(i => i.id === updated.itemId);
    if (addedIdx !== -1) {
      recentlyAdded.value[addedIdx] = { 
        ...recentlyAdded.value[addedIdx], 
        userProgress: updated 
      };
    }
  });

  absService.onLibraryUpdate(() => fetchDashboardData());
});

onUnmounted(() => {
  absService.disconnect();
});

const handleTabChange = (tab: LibraryTab) => {
  activeTab.value = tab;
  selectedSeries.value = null;
  if (tab === 'HOME') fetchDashboardData();
};

const handleScan = async () => {
  if (isScanning.value) return;
  isScanning.value = true;
  try {
    await absService.scanLibrary();
  } catch (e) {
    console.error("Scan failed", e);
  } finally {
    setTimeout(() => isScanning.value = false, 2000); 
  }
};

const filteredReading = computed(() => {
  if (!searchTerm.value) return currentlyReading.value;
  const term = searchTerm.value.toLowerCase();
  return currentlyReading.value.filter(i => i.media.metadata.title.toLowerCase().includes(term) || i.media.metadata.authorName.toLowerCase().includes(term));
});

const filteredAdded = computed(() => {
  if (!searchTerm.value) return recentlyAdded.value;
  const term = searchTerm.value.toLowerCase();
  return recentlyAdded.value.filter(i => i.media.metadata.title.toLowerCase().includes(term) || i.media.metadata.authorName.toLowerCase().includes(term));
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
    @scan="handleScan"
  >
    <div class="flex-1 min-h-0">
      <SeriesView 
        v-if="selectedSeries"
        :series="selectedSeries" :absService="absService"
        @back="selectedSeries = null"
        @select-item="emit('select-item', $event)"
      />

      <template v-else>
        <div v-if="activeTab === 'HOME'" class="h-full bg-[#0d0d0d] overflow-y-auto custom-scrollbar -mx-4 md:-mx-8 px-4 md:px-8 pt-4 pb-40">
          
          <!-- New Curated Shelf (Top Priority) -->
          <ContinueListening 
            v-if="!searchTerm" 
            :absService="absService" 
            @resume-book="emit('select-item', $event)"
          />

          <section v-if="filteredReading.length > 0 && searchTerm" class="shelf-row">
            <div class="shelf-tag">
              <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Currently Listening</span>
            </div>
            <div class="flex gap-6 overflow-x-auto no-scrollbar pb-6 pl-2">
              <div v-for="item in filteredReading" :key="item.id" class="w-32 md:w-40 shrink-0">
                <BookCard 
                  :item="item" 
                  :coverUrl="absService.getCoverUrl(item.id)" 
                  show-metadata
                  @click="emit('select-item', item)" 
                />
              </div>
            </div>
          </section>

          <section v-if="filteredAdded.length > 0" class="shelf-row">
            <div class="shelf-tag">
              <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Recently Added</span>
            </div>
            <div class="flex gap-8 overflow-x-auto no-scrollbar pb-10 pl-2">
              <div v-for="item in filteredAdded" :key="item.id" class="w-32 md:w-40 shrink-0">
                <BookCard 
                  :item="item" 
                  :coverUrl="absService.getCoverUrl(item.id)" 
                  show-metadata
                  @click="emit('select-item', item)" 
                />
              </div>
            </div>
          </section>

          <section v-if="recentSeries.length > 0 && !searchTerm" class="shelf-row">
            <div class="shelf-tag">
              <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Archives by Stacks</span>
            </div>
            <div class="flex gap-12 md:gap-16 overflow-x-auto no-scrollbar pb-6 pl-4">
              <div v-for="series in recentSeries" :key="series.id" class="w-44 md:w-56 shrink-0">
                <SeriesCard 
                  :series="series" 
                  :coverUrl="absService.getCoverUrl(series.books?.[0]?.id || '')"
                  @click="selectedSeries = series"
                />
              </div>
            </div>
          </section>

          <div v-if="searchTerm && filteredReading.length === 0 && filteredAdded.length === 0" class="flex flex-col items-center justify-center py-40 text-center opacity-40">
            <h3 class="text-xl font-black uppercase tracking-tighter text-neutral-500">No matching artifacts</h3>
          </div>
        </div>

        <div v-else-if="activeTab === 'LIBRARY'" class="h-full">
          <Bookshelf :absService="absService" :sortMethod="sortMethod" :desc="desc" :search="searchTerm" @select-item="emit('select-item', $event)" />
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