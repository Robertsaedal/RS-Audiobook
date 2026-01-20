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
import { PackageOpen } from 'lucide-vue-next';

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

const absService = ref<ABSService | null>(null);
const activeTab = ref<LibraryTab>('HOME');
const searchTerm = ref('');
const sortMethod = ref('addedAt'); 
const desc = ref(1);
const selectedSeries = ref<ABSSeries | null>(null);
const isScanning = ref(false);

const currentlyReading = ref<ABSLibraryItem[]>([]);
const continueSeries = ref<ABSLibraryItem[]>([]);
const recentlyAdded = ref<ABSLibraryItem[]>([]);
const recentSeries = ref<ABSSeries[]>([]);

const initService = () => {
  if (absService.value) {
    absService.value.disconnect();
  }
  absService.value = new ABSService(
    props.auth.serverUrl, 
    props.auth.user?.token || '', 
    props.auth.user?.id
  );
  setupListeners();
};

const setupListeners = () => {
  if (!absService.value) return;
  
  // Real-time progress synchronization
  absService.value.onProgressUpdate((progress) => handleProgressUpdate(progress));
  absService.value.onLibraryUpdate(() => fetchDashboardData());
};

const handleProgressUpdate = (progress: ABSProgress) => {
  let found = false;

  // 1. Update Currently Reading (Continue Listening)
  const crIndex = currentlyReading.value.findIndex(i => i.id === progress.itemId);
  if (crIndex !== -1) {
    found = true;
    if (progress.isFinished || progress.hideFromContinueListening) {
      currentlyReading.value.splice(crIndex, 1);
    } else {
      // In-place update to trigger reactivity without list jumps
      const item = currentlyReading.value[crIndex];
      item.userProgress = progress;
      currentlyReading.value[crIndex] = { ...item }; // Force reactivity
    }
  }

  // 2. Update Recently Added
  const raIndex = recentlyAdded.value.findIndex(i => i.id === progress.itemId);
  if (raIndex !== -1) {
    const item = recentlyAdded.value[raIndex];
    item.userProgress = progress;
    recentlyAdded.value[raIndex] = { ...item };
  }

  // 3. Update Continue Series
  const csIndex = continueSeries.value.findIndex(i => i.id === progress.itemId);
  if (csIndex !== -1) {
    const item = continueSeries.value[csIndex];
    item.userProgress = progress;
    continueSeries.value[csIndex] = { ...item };
  }

  // If item not found in "Continue Listening" and it's active, refetch dashboard to add it
  if (!found && !progress.isFinished && !progress.hideFromContinueListening) {
    fetchDashboardData();
  }
};

const fetchDashboardData = async () => {
  if (!absService.value) return;
  try {
    // Official Strategy: Use personalized shelves + in-progress items
    const [personalized, inProgress] = await Promise.all([
      absService.value.getPersonalizedShelves(),
      absService.value.getItemsInProgress()
    ]);

    // Deduplicate and filter Finished items from "Continue Listening"
    const combinedMap = new Map<string, ABSLibraryItem>();
    
    // 1. High priority: Items currently in progress
    inProgress.forEach(item => {
      if (item.userProgress && !item.userProgress.isFinished && !item.userProgress.hideFromContinueListening) {
        combinedMap.set(item.id, item);
      }
    });

    // 2. Secondary: Items from personalized shelves (Continue Listening)
    if (personalized && Array.isArray(personalized)) {
      // Continue Listening Shelf
      const continueShelf = personalized.find(s => s.id === 'continue-listening');
      if (continueShelf && continueShelf.entities) {
        continueShelf.entities.forEach((entity: any) => {
          const item = entity.libraryItem || entity;
          if (item?.id && !combinedMap.has(item.id)) {
            if (item.userProgress && !item.userProgress.isFinished && !item.userProgress.hideFromContinueListening) {
              combinedMap.set(item.id, item);
            }
          }
        });
      }

      // Continue Series Shelf (Next in series)
      const seriesShelf = personalized.find(s => s.id === 'continue-series');
      if (seriesShelf && seriesShelf.entities) {
        continueSeries.value = seriesShelf.entities.map((e: any) => e.libraryItem || e);
      } else {
        continueSeries.value = [];
      }
    }

    currentlyReading.value = Array.from(combinedMap.values())
      .sort((a, b) => (b.userProgress?.lastUpdate || 0) - (a.userProgress?.lastUpdate || 0))
      .slice(0, 20);

    // Recently Added - Ensure descending addedAt
    const { results: added } = await absService.value.getLibraryItemsPaged({ 
      limit: 20, sort: 'addedAt', desc: 1 
    });
    recentlyAdded.value = added;

    // Recent Series
    const { results: series } = await absService.value.getLibrarySeriesPaged({ 
      limit: 12, sort: 'addedDate', desc: 1 
    });
    recentSeries.value = series;
  } catch (e) {
    console.error("Dashboard hydration failed", e);
  }
};

onMounted(() => {
  initService();
  fetchDashboardData();
  if (props.initialSeriesId) {
    handleJumpToSeries(props.initialSeriesId);
  }
});

const handleJumpToSeries = async (seriesId: string) => {
  if (!absService.value) return;
  const { results: allSeries } = await absService.value.getLibrarySeriesPaged({ limit: 100 });
  const target = allSeries.find(s => s.id === seriesId);
  if (target) {
    selectedSeries.value = target;
    activeTab.value = 'SERIES';
  }
  emit('clear-initial-series');
};

watch(() => props.auth.user?.token, () => {
  initService();
  fetchDashboardData();
});

onUnmounted(() => {
  absService.value?.disconnect();
});

const handleTabChange = (tab: LibraryTab) => {
  activeTab.value = tab;
  selectedSeries.value = null;
  if (tab === 'HOME') fetchDashboardData();
};

const handleScan = async () => {
  if (isScanning.value || !absService.value) return;
  isScanning.value = true;
  try {
    await absService.value.scanLibrary();
  } catch (e) {
    console.error("Scan failed", e);
  } finally {
    setTimeout(() => isScanning.value = false, 2000); 
  }
};

const trimmedSearch = computed(() => searchTerm.value.trim());

const filteredReading = computed(() => {
  const list = currentlyReading.value;
  if (!trimmedSearch.value) return list;
  const term = trimmedSearch.value.toLowerCase();
  return list.filter(i => 
    i.media.metadata.title.toLowerCase().includes(term) || 
    i.media.metadata.authorName.toLowerCase().includes(term) ||
    (i.media.metadata.seriesName && i.media.metadata.seriesName.toLowerCase().includes(term))
  );
});

const filteredNextUp = computed(() => {
  const list = continueSeries.value;
  if (!trimmedSearch.value) return list;
  const term = trimmedSearch.value.toLowerCase();
  return list.filter(i => 
    i.media.metadata.title.toLowerCase().includes(term) || 
    i.media.metadata.authorName.toLowerCase().includes(term) ||
    (i.media.metadata.seriesName && i.media.metadata.seriesName.toLowerCase().includes(term))
  );
});

const filteredAdded = computed(() => {
  if (!trimmedSearch.value) return recentlyAdded.value;
  const term = trimmedSearch.value.toLowerCase();
  return recentlyAdded.value.filter(i => 
    i.media.metadata.title.toLowerCase().includes(term) || 
    i.media.metadata.authorName.toLowerCase().includes(term) ||
    (i.media.metadata.seriesName && i.media.metadata.seriesName.toLowerCase().includes(term))
  );
});

const isHomeEmpty = computed(() => {
  return filteredReading.value.length === 0 && filteredAdded.value.length === 0 && recentSeries.value.length === 0 && filteredNextUp.value.length === 0;
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
    <div class="flex-1 min-h-0 h-full flex flex-col">
      <SeriesView 
        v-if="selectedSeries && absService"
        :series="selectedSeries" :absService="absService"
        @back="selectedSeries = null"
        @select-item="emit('select-item', $event)"
      />

      <template v-else>
        <div v-if="activeTab === 'HOME'" class="h-full bg-[#0d0d0d] overflow-y-auto custom-scrollbar -mx-4 md:-mx-8 px-4 md:px-8 pt-4 pb-40">
          
          <template v-if="!isHomeEmpty || trimmedSearch">
            <section v-if="filteredReading.length > 0 && absService" class="shelf-row">
              <div class="shelf-tag">
                <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Continue Listening</span>
              </div>
              <div class="flex gap-8 overflow-x-auto no-scrollbar pb-10 pl-2">
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

            <section v-if="filteredNextUp.length > 0 && absService" class="shelf-row">
              <div class="shelf-tag">
                <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Next in Series</span>
              </div>
              <div class="flex gap-8 overflow-x-auto no-scrollbar pb-10 pl-2">
                <div v-for="item in filteredNextUp" :key="item.id" class="w-32 md:w-40 shrink-0">
                  <BookCard 
                    :item="item" 
                    :coverUrl="absService.getCoverUrl(item.id)" 
                    show-metadata
                    @click="emit('select-item', item)" 
                  />
                </div>
              </div>
            </section>

            <section v-if="filteredAdded.length > 0 && absService" class="shelf-row">
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

            <section v-if="recentSeries.length > 0 && !trimmedSearch && absService" class="shelf-row">
              <div class="shelf-tag">
                <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Series Stacks</span>
              </div>
              <div class="flex gap-12 md:gap-16 overflow-x-auto no-scrollbar pb-6 pl-4">
                <div v-for="series in recentSeries" :key="series.id" class="w-44 md:w-56 shrink-0">
                  <SeriesCard 
                    :series="series" 
                    :coverUrl="absService.getCoverUrl(series.books?.[0]?.id || '')"
                    :bookCovers="series.books?.slice(0, 3).map(b => absService.getCoverUrl(b.id)) || []"
                    @click="selectedSeries = series"
                  />
                </div>
              </div>
            </section>

            <div v-if="trimmedSearch && filteredReading.length === 0 && filteredAdded.length === 0 && filteredNextUp.length === 0" class="flex flex-col items-center justify-center py-40 text-center opacity-40">
              <h3 class="text-xl font-black uppercase tracking-tighter text-neutral-500">No matching artifacts</h3>
              <p class="text-[10px] font-black uppercase tracking-[0.4em] mt-2">Adjust frequency or search term</p>
            </div>
          </template>

          <div v-else class="flex flex-col items-center justify-center py-40 text-center opacity-40">
            <PackageOpen :size="64" class="text-neutral-800 mb-6" />
            <h3 class="text-xl font-black uppercase tracking-tighter text-neutral-500">Archive Void</h3>
            <p class="text-[10px] font-black uppercase tracking-[0.4em] mt-2">No records detected in current frequency</p>
          </div>
        </div>

        <div v-else-if="activeTab === 'LIBRARY' && absService" class="h-full flex flex-col overflow-hidden">
          <Bookshelf :absService="absService" :sortMethod="sortMethod" :desc="desc" :search="trimmedSearch" @select-item="emit('select-item', $event)" />
        </div>

        <div v-else-if="activeTab === 'SERIES' && absService" class="h-full flex flex-col overflow-hidden">
          <SeriesShelf :absService="absService" :sortMethod="sortMethod" :desc="desc" :search="trimmedSearch" @select-series="selectedSeries = $event" />
        </div>

        <div v-else-if="activeTab === 'REQUEST'" class="h-full flex flex-col overflow-hidden">
          <RequestPortal />
        </div>
      </template>
    </div>
  </LibraryLayout>
</template>