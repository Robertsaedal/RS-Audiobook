<script setup lang="ts">
import { ref, onMounted, onUnmounted, onActivated, watch, computed, nextTick, reactive } from 'vue';
import { AuthState, ABSLibraryItem, ABSSeries, ABSProgress } from '../types';
import { ABSService } from '../services/absService';
import { OfflineManager } from '../services/offlineManager';
import LibraryLayout, { LibraryTab } from '../components/LibraryLayout.vue';
import Bookshelf from '../components/Bookshelf.vue';
import SeriesShelf from '../components/SeriesShelf.vue';
import SeriesView from './SeriesView.vue';
import RequestPortal from '../components/RequestPortal.vue';
import StatsView from './StatsView.vue';
import BookCard from '../components/BookCard.vue';
import SeriesCard from '../components/SeriesCard.vue';
import { PackageOpen, Loader2, WifiOff, RotateCw } from 'lucide-vue-next';

// Define component name for KeepAlive inclusion
defineOptions({
  name: 'Library'
});

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
const isOfflineMode = ref(!navigator.onLine);

// Sync State
const isSyncing = ref(false);
const syncFeedback = ref('');

// Raw Data Refs (from API)
const currentlyReadingRaw = ref<ABSLibraryItem[]>([]);
const continueSeriesRaw = ref<ABSLibraryItem[]>([]);
const recentlyAddedRaw = ref<ABSLibraryItem[]>([]);
const recentSeries = ref<ABSSeries[]>([]);

// Real-time Progress Map
const progressMap = reactive(new Map<string, ABSProgress>());

// Search State
const searchResults = ref<{ books: ABSLibraryItem[], series: ABSSeries[] }>({ books: [], series: [] });
const isGlobalSearching = ref(false);
let debounceTimeout: any = null;

const initProgressMap = () => {
  if (props.auth.user?.mediaProgress) {
    props.auth.user.mediaProgress.forEach((p: any) => {
      const progress: ABSProgress = {
        itemId: p.libraryItemId,
        currentTime: p.currentTime,
        duration: p.duration,
        progress: p.progress,
        isFinished: p.isFinished,
        lastUpdate: p.lastUpdate,
        hideFromContinueListening: p.hideFromContinueListening
      };
      progressMap.set(progress.itemId, progress);
    });
  }
};

const initService = async () => {
  if (absService.value) {
    absService.value.disconnect();
  }
  
  absService.value = new ABSService(
    props.auth.serverUrl, 
    props.auth.user?.token || '', 
    props.auth.user?.id,
    props.auth.user?.defaultLibraryId
  );

  if (!absService.value.libraryId && !isOfflineMode.value) {
    try {
      const libraries = await absService.value.getLibraries();
      if (libraries.length > 0) {
        absService.value.libraryId = libraries[0].id;
      }
    } catch (e) {
      console.warn("Could not discover libraries", e);
    }
  }

  setupListeners();
};

const setupListeners = () => {
  if (!absService.value) return;
  absService.value.onProgressUpdate((progress) => handleProgressUpdate(progress));
  absService.value.onProgressDelete((itemId) => handleProgressDelete(itemId));
  absService.value.onLibraryUpdate(() => fetchDashboardData());
};

const handleProgressUpdate = async (progress: ABSProgress) => {
  // 1. Update the central source of truth (Reactivity will propagate to Computed Props)
  progressMap.set(progress.itemId, progress);

  // 2. Handling Completed Items (with animation delay)
  if (progress.isFinished) {
    // Let it stay for a moment for the 'completion animation' to play in BookCard
    setTimeout(() => {
        handleProgressDelete(progress.itemId);
    }, 2500);
    return;
  }

  // 3. Handling New Books (Not in list yet)
  const idx = currentlyReadingRaw.value.findIndex(i => i.id === progress.itemId);
  
  if (idx === -1 && !progress.isFinished && !progress.hideFromContinueListening && !isOfflineMode.value && absService.value) {
    try {
      // Optimistically fetch just this item to inject it
      const response = await absService.value.getLibraryItemsPaged({
        filter: `id.eq.${progress.itemId}`,
        limit: 1
      });
      
      if (response.results && response.results.length > 0) {
        // Prepend to the raw list. computed property will pick up the progress from progressMap
        const newItem = response.results[0];
        currentlyReadingRaw.value = [newItem, ...currentlyReadingRaw.value];
      }
    } catch (e) {
      // If fetching single item fails, fall back to full dashboard refresh
      fetchDashboardData();
    }
  }
};

const handleProgressDelete = (itemId: string) => {
  progressMap.delete(itemId);
  // Remove from shelf
  currentlyReadingRaw.value = currentlyReadingRaw.value.filter(i => i.id !== itemId);
};

const handleMarkFinished = async (item: ABSLibraryItem) => {
  if (isOfflineMode.value) {
    currentlyReadingRaw.value = currentlyReadingRaw.value.filter(i => i.id !== item.id);
    return;
  }
  
  if (!absService.value) return;
  try {
    // Optimistic Update
    const finishedState: ABSProgress = { 
        itemId: item.id, 
        currentTime: item.media.duration, 
        duration: item.media.duration, 
        progress: 1, 
        isFinished: true, 
        lastUpdate: Date.now() 
    };
    progressMap.set(item.id, finishedState);

    await absService.value.updateProgress(item.id, { isFinished: true });
    
    // UI Removal is handled by socket update or immediate fallback
    setTimeout(() => {
         currentlyReadingRaw.value = currentlyReadingRaw.value.filter(i => i.id !== item.id);
    }, 2000);
    
  } catch (e) {
    console.error("Failed to mark as finished", e);
    fetchDashboardData();
  }
};

const handleOfflineFallback = async () => {
  isOfflineMode.value = true;
  const localBooks = await OfflineManager.getAllDownloadedBooks();
  
  currentlyReadingRaw.value = localBooks.filter(b => {
    const p = b.userProgress;
    return p && p.progress > 0 && !p.isFinished;
  });

  recentlyAddedRaw.value = localBooks.filter(b => {
    const p = b.userProgress;
    return !p || p.progress === 0 || p.isFinished;
  });

  continueSeriesRaw.value = [];
  recentSeries.value = [];
};

// --- Hydration Helpers (Computed) ---
// These ensure that the Home View items always reflect the LATEST socket data
const hydrateList = (list: ABSLibraryItem[]) => {
  return list.map(item => {
    const live = progressMap.get(item.id);
    // If we have live progress, overlay it. Otherwise return item as is.
    return live ? { ...item, userProgress: live } : item;
  });
};

const hydratedCurrentlyReading = computed(() => hydrateList(currentlyReadingRaw.value));
const hydratedContinueSeries = computed(() => hydrateList(continueSeriesRaw.value));
const hydratedRecentlyAdded = computed(() => hydrateList(recentlyAddedRaw.value));

const fetchDashboardData = async () => {
  if (!navigator.onLine) {
    await handleOfflineFallback();
    return;
  }

  if (!absService.value) return;
  try {
    const shelves = await absService.value.getPersonalizedShelves({ limit: 12 });
    
    if (!shelves || !Array.isArray(shelves)) return;

    currentlyReadingRaw.value = [];
    continueSeriesRaw.value = [];
    recentlyAddedRaw.value = [];
    recentSeries.value = [];

    shelves.forEach((shelf: any) => {
      switch (shelf.id) {
        case 'continue-listening':
          currentlyReadingRaw.value = shelf.entities;
          break;
        case 'continue-series':
          continueSeriesRaw.value = shelf.entities;
          break;
        case 'recently-added':
        case 'newest-episodes':
          recentlyAddedRaw.value = shelf.entities;
          break;
        case 'recent-series':
          recentSeries.value = shelf.entities;
          break;
      }
    });
    
    isOfflineMode.value = false;

  } catch (e) {
    console.error("Dashboard hydration failed", e);
    await handleOfflineFallback();
  }
};

const forceSyncProgress = async () => {
  if (isSyncing.value || !absService.value || isOfflineMode.value) return;
  isSyncing.value = true;
  syncFeedback.value = '';
  
  try {
    // 1. Socket Reconnect (Manual Intervention)
    absService.value.reconnect();

    // 2. Fetch In-Progress Data to update ProgressMap
    const items = await absService.value.getItemsInProgress();
    
    // 3. Patch Map
    items.forEach(item => {
        const p = item.userProgress || (item.media as any)?.userProgress || (item as any).userMediaProgress;
        if (p) {
            progressMap.set(item.id, {
                itemId: item.id,
                ...p
            });
        }
    });

    // 4. Refresh Dashboard (Shelves)
    await fetchDashboardData();

    // 5. Feedback
    syncFeedback.value = "Synced";
    setTimeout(() => syncFeedback.value = '', 2000);
  } catch (e) {
    console.error("Sync failed", e);
  } finally {
    isSyncing.value = false;
  }
};

const updateOnlineStatus = () => {
  const online = navigator.onLine;
  isOfflineMode.value = !online;
  if (online) {
    initService().then(() => fetchDashboardData());
  } else {
    handleOfflineFallback();
  }
};

onMounted(async () => {
  initProgressMap(); 
  await initService();
  await fetchDashboardData();
  
  if (props.initialSeriesId) {
    await nextTick();
    handleJumpToSeries(props.initialSeriesId);
  }
  
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
});

onActivated(async () => {
  if (props.initialSeriesId) {
    await nextTick(); 
    handleJumpToSeries(props.initialSeriesId);
  }
});

watch(() => props.initialSeriesId, async (newVal) => {
  if (newVal) {
    await nextTick();
    handleJumpToSeries(newVal);
  }
});

onUnmounted(() => {
  absService.value?.disconnect();
  window.removeEventListener('online', updateOnlineStatus);
  window.removeEventListener('offline', updateOnlineStatus);
});

const handleJumpToSeries = async (seriesId: string) => {
  if (!absService.value || isOfflineMode.value) return;
  
  if (selectedSeries.value?.id === seriesId) {
    activeTab.value = 'SERIES';
    emit('clear-initial-series');
    return;
  }

  try {
    const series = await absService.value.getSeries(seriesId);
    if (series) {
      selectedSeries.value = series;
      activeTab.value = 'SERIES'; 
      emit('clear-initial-series');
    }
  } catch (e) {
    console.error("Failed to jump to series", e);
  }
};

watch(() => props.auth.user?.token, () => {
  initProgressMap();
  initService().then(() => fetchDashboardData());
});

const handleTabChange = (tab: LibraryTab) => {
  activeTab.value = tab;
  selectedSeries.value = null;
  searchTerm.value = ''; 
  if (tab === 'HOME') fetchDashboardData();
};

const handleScan = async () => {
  if (isScanning.value || !absService.value || isOfflineMode.value) return;
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

// Global Search Logic
const performGlobalSearch = async () => {
  if (!trimmedSearch.value || trimmedSearch.value.length < 2 || !absService.value || isOfflineMode.value) return;
  isGlobalSearching.value = true;
  try {
    const results = await absService.value.quickSearch(trimmedSearch.value);
    if (results) searchResults.value = results;
  } catch (e) {
    console.error("Search failed", e);
  } finally {
    isGlobalSearching.value = false;
  }
};

watch(trimmedSearch, () => {
  if (debounceTimeout) clearTimeout(debounceTimeout);
  if (!trimmedSearch.value) {
    searchResults.value = { books: [], series: [] };
    return;
  }
  debounceTimeout = setTimeout(performGlobalSearch, 300);
});

const isHomeEmpty = computed(() => {
  return currentlyReadingRaw.value.length === 0 && recentlyAddedRaw.value.length === 0 && recentSeries.value.length === 0 && continueSeriesRaw.value.length === 0;
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
    <div class="flex-1 min-h-0 h-full flex flex-col relative">
      <!-- Offline Banner -->
      <Transition name="slide-down">
        <div v-if="isOfflineMode" class="absolute top-0 left-0 right-0 z-50 bg-amber-600/90 backdrop-blur-md px-4 py-2 flex items-center justify-center gap-2 text-white shadow-lg">
          <WifiOff :size="14" />
          <span class="text-[10px] font-black uppercase tracking-widest">Offline Mode • Showing Downloaded Books</span>
        </div>
      </Transition>

      <SeriesView 
        v-if="selectedSeries && absService"
        :series="selectedSeries" 
        :absService="absService"
        :auth="auth"
        :progressMap="progressMap"
        @back="selectedSeries = null"
        @select-item="emit('select-item', $event)"
      />

      <template v-else>
        <!-- Global Search Results View -->
        <div v-if="trimmedSearch" class="h-full bg-[#0d0d0d] overflow-y-auto custom-scrollbar px-4 md:px-8 pt-8 pb-40">
          <div class="mb-8 flex items-center gap-4">
            <h2 class="text-xl font-black uppercase tracking-tighter text-white">Search Results</h2>
            <Loader2 v-if="isGlobalSearching" class="animate-spin text-purple-500" :size="20" />
          </div>

          <div v-if="!isGlobalSearching && searchResults.books.length === 0 && searchResults.series.length === 0" class="flex flex-col items-center justify-center py-20 text-center opacity-40">
            <h3 class="text-lg font-black uppercase tracking-tighter text-neutral-500">No Matches Found</h3>
            <p class="text-[9px] font-black uppercase tracking-[0.4em] mt-2">Adjust search terms</p>
          </div>

          <template v-else>
            <!-- Series Results -->
            <section v-if="searchResults.series.length > 0 && absService" class="shelf-row border-t-0">
              <div class="shelf-tag">
                <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Series Found</span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                <div v-for="series in searchResults.series" :key="series.id">
                  <SeriesCard 
                    :series="series" 
                    :coverUrl="absService.getCoverUrl(series.books?.[0]?.id || '')"
                    :bookCovers="series.books?.slice(0, 3).map(b => absService.getCoverUrl(b.id)) || []"
                    @click="selectedSeries = series"
                  />
                </div>
              </div>
            </section>

            <!-- Book Results -->
            <section v-if="searchResults.books.length > 0 && absService" class="shelf-row">
              <div class="shelf-tag">
                <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Books Found</span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                <BookCard 
                  v-for="item in searchResults.books" 
                  :key="item.id" 
                  :item="item" 
                  :coverUrl="absService.getCoverUrl(item.id)" 
                  show-metadata
                  @click="emit('select-item', item)" 
                />
              </div>
            </section>
          </template>
        </div>

        <!-- Standard Tab Views (Only visible when NOT searching) -->
        <template v-else>
          <div v-if="activeTab === 'HOME'" class="h-full bg-[#0d0d0d] overflow-y-auto custom-scrollbar -mx-4 md:-mx-8 px-4 md:px-8 pt-4 pb-40">
            <!-- Add padding top if offline banner is shown -->
            <div :class="{ 'pt-8': isOfflineMode }"></div>

            <template v-if="!isHomeEmpty">
              <!-- Increased py-8 for extra spacing -->
              <section v-if="hydratedCurrentlyReading.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag gap-3 pr-2">
                  <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">
                    {{ isOfflineMode ? 'In Progress (Local)' : 'Continue Listening' }}
                  </span>
                  <button 
                    v-if="!isOfflineMode"
                    @click="forceSyncProgress" 
                    class="p-1 text-purple-500 hover:text-purple-400 transition-colors rounded-full hover:bg-white/10 flex items-center gap-2"
                    :disabled="isSyncing"
                    title="Force Refresh Progress"
                  >
                    <RotateCw :size="12" :class="{ 'animate-spin': isSyncing }" />
                    <span v-if="syncFeedback" class="text-[8px] font-black uppercase tracking-widest animate-fade-in text-white">{{ syncFeedback }}</span>
                  </button>
                </div>
                <!-- Increased gap-10 for better separation -->
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-10 pl-2">
                  <div v-for="item in hydratedCurrentlyReading" :key="item.id" class="w-32 md:w-40 shrink-0">
                    <BookCard 
                      :item="item" 
                      :coverUrl="absService.getCoverUrl(item.id)" 
                      show-metadata
                      show-progress
                      @click="emit('select-item', item)"
                      @finish="handleMarkFinished"
                    />
                  </div>
                </div>
              </section>

              <section v-if="hydratedContinueSeries.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag">
                  <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Next in Series</span>
                </div>
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-10 pl-2">
                  <div v-for="item in hydratedContinueSeries" :key="item.id" class="w-32 md:w-40 shrink-0">
                    <BookCard 
                      :item="item" 
                      :coverUrl="absService.getCoverUrl(item.id)" 
                      show-metadata
                      @click="emit('select-item', item)" 
                    />
                  </div>
                </div>
              </section>

              <section v-if="hydratedRecentlyAdded.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag">
                  <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">
                    {{ isOfflineMode ? 'Downloaded' : 'Recently Added' }}
                  </span>
                </div>
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-10 pl-2">
                  <div v-for="item in hydratedRecentlyAdded" :key="item.id" class="w-32 md:w-40 shrink-0">
                    <BookCard 
                      :item="item" 
                      :coverUrl="absService.getCoverUrl(item.id)" 
                      show-metadata
                      @click="emit('select-item', item)" 
                    />
                  </div>
                </div>
              </section>

              <section v-if="recentSeries.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag">
                  <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Series Stacks</span>
                </div>
                <div class="flex gap-16 overflow-x-auto no-scrollbar pb-6 pl-4">
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
            </template>

            <div v-else class="flex flex-col items-center justify-center py-40 text-center opacity-40">
              <PackageOpen :size="64" class="text-neutral-800 mb-6" />
              <h3 class="text-xl font-black uppercase tracking-tighter text-neutral-500">Archive Void</h3>
              <p class="text-[9px] font-black uppercase tracking-[0.4em] mt-2">
                {{ isOfflineMode ? 'No downloads found on device' : 'No records detected in current frequency' }}
              </p>
            </div>
          </div>

          <div v-else-if="activeTab === 'LIBRARY' && absService" class="h-full flex flex-col overflow-hidden">
            <Bookshelf :absService="absService" :sortMethod="sortMethod" :desc="desc" :search="''" :progressMap="progressMap" @select-item="emit('select-item', $event)" />
          </div>

          <div v-else-if="activeTab === 'SERIES' && absService" class="h-full flex flex-col overflow-hidden">
            <SeriesShelf :absService="absService" :sortMethod="sortMethod" :desc="desc" :search="''" @select-series="selectedSeries = $event" />
          </div>

          <div v-else-if="activeTab === 'REQUEST'" class="h-full flex flex-col overflow-hidden">
            <RequestPortal />
          </div>

          <div v-else-if="activeTab === 'STATS' && absService" class="h-full flex flex-col overflow-hidden">
             <StatsView :absService="absService" />
          </div>
        </template>
      </template>
    </div>
  </LibraryLayout>
</template>

<style scoped>
.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.3s ease-out;
}
.slide-down-enter-from, .slide-down-leave-to {
  transform: translateY(-100%);
}
</style>