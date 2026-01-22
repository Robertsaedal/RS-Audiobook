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

defineOptions({
  name: 'Library'
});

const props = defineProps<{
  auth: AuthState,
  isStreaming?: boolean,
  initialSeriesId?: string | null,
  progressMap?: Map<string, ABSProgress>,
  providedService?: ABSService | null
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

const isSyncing = ref(false);
const syncFeedback = ref('');

const currentlyReadingRaw = ref<ABSLibraryItem[]>([]);
const continueSeriesRaw = ref<ABSLibraryItem[]>([]);
const recentlyAddedRaw = ref<ABSLibraryItem[]>([]);
const recentSeries = ref<ABSSeries[]>([]);

// Local fallback map if props are not used (for standalone testing)
const localProgressMap = reactive(new Map<string, ABSProgress>());

// Use global map if provided, otherwise local
const activeProgressMap = computed(() => props.progressMap || localProgressMap);

const searchResults = ref<{ books: ABSLibraryItem[], series: ABSSeries[] }>({ books: [], series: [] });
const isGlobalSearching = ref(false);
let debounceTimeout: any = null;

const initProgressMap = async () => {
  // Use local auth as baseline
  if (props.auth.user?.mediaProgress) {
    props.auth.user.mediaProgress.forEach((p: any) => {
      handleProgressUpdate({
        itemId: p.libraryItemId,
        currentTime: p.currentTime,
        duration: p.duration,
        progress: p.progress,
        isFinished: p.isFinished,
        lastUpdate: p.lastUpdate,
        hideFromContinueListening: p.hideFromContinueListening
      }, false); 
    });
  }

  // Fetch complete fresh list from server
  if (absService.value && !isOfflineMode.value) {
    try {
      const allProgress = await absService.value.getAllUserProgress();
      if (allProgress && Array.isArray(allProgress)) {
        allProgress.forEach(p => handleProgressUpdate(p, false));
      }
    } catch (e) {
      console.warn("Failed to fetch full progress list", e);
    }
  }
};

const initService = async () => {
  // If parent provided a service, use it. Otherwise create new.
  if (props.providedService) {
    absService.value = props.providedService;
  } else {
    if (absService.value) {
      absService.value.disconnect();
    }
    
    absService.value = new ABSService(
      props.auth.serverUrl, 
      props.auth.user?.token || '', 
      props.auth.user?.id,
      props.auth.user?.defaultLibraryId
    );
  }

  if (!absService.value.libraryId && !isOfflineMode.value) {
    try {
      const libraries = await absService.value.getLibraries();
      if (libraries.length > 0) {
        absService.value.libraryId = libraries[0].id;
      }
    } catch (e) {
      console.warn("Library discovery failed", e);
    }
  }

  // Only setup local listeners if we created the service OR if we want redundant local handling
  // If service is provided, App.vue handles global map updates.
  // However, we still need to know when shelves should update (item_added etc)
  setupListeners();
};

const setupListeners = () => {
  if (!absService.value) return;

  // Listen for library updates to refresh shelves
  absService.value.onLibraryUpdate(() => fetchDashboardData());
  
  // If we are using a local service (not provided by parent), we must handle progress
  if (!props.providedService) {
    absService.value.onProgressUpdate((p) => handleProgressUpdate(p));
    absService.value.onUserOnline((p) => handleProgressUpdate(p as ABSProgress));
    absService.value.onInit((data) => {
        if (data.user && data.user.mediaProgress) {
            data.user.mediaProgress.forEach((p: any) => {
                handleProgressUpdate({
                    itemId: p.libraryItemId,
                    currentTime: p.currentTime,
                    duration: p.duration,
                    progress: p.progress,
                    isFinished: p.isFinished,
                    lastUpdate: p.lastUpdate,
                    hideFromContinueListening: p.hideFromContinueListening
                });
            });
        }
    });
  }
};

const handleProgressUpdate = (p: ABSProgress, triggerEffects = true) => {
  const duration = p.duration || 1;
  const calculatedProgress = p.progress !== undefined ? p.progress : (p.currentTime / duration);

  const newItem: ABSProgress = {
      itemId: p.itemId,
      currentTime: p.currentTime,
      duration: duration,
      progress: calculatedProgress,
      isFinished: p.isFinished,
      lastUpdate: p.lastUpdate || Date.now(),
      hideFromContinueListening: p.hideFromContinueListening
  };

  // Update map (Global map is reactive, so modifying it here works if passed via prop)
  // If props.progressMap is passed, we update it. If not, we update local.
  const mapToUpdate = props.progressMap || localProgressMap;
  const existing = mapToUpdate.get(p.itemId);
  if (existing) {
    Object.assign(existing, newItem);
  } else {
    mapToUpdate.set(p.itemId, newItem);
  }

  if (triggerEffects) {
    if (p.isFinished) {
      setTimeout(() => {
          fetchDashboardData(); 
      }, 2000);
      return;
    }

    if (!isOfflineMode.value) {
      const idx = currentlyReadingRaw.value.findIndex(i => i.id === p.itemId);
      if (idx === -1 && !p.isFinished && !p.hideFromContinueListening) {
        absService.value?.getLibraryItemsPaged({ filter: `id.eq.${p.itemId}`, limit: 1 })
          .then(response => {
             if (response.results && response.results.length > 0) {
               const item = response.results[0];
               if (!currentlyReadingRaw.value.find(i => i.id === item.id)) {
                  currentlyReadingRaw.value = [item, ...currentlyReadingRaw.value];
               }
             }
          });
      }
    }
  }
};

const handleMarkFinished = async (item: ABSLibraryItem) => {
  if (isOfflineMode.value) {
    currentlyReadingRaw.value = currentlyReadingRaw.value.filter(i => i.id !== item.id);
    return;
  }
  
  if (!absService.value) return;
  try {
    const finishedState: ABSProgress = { 
        itemId: item.id, 
        currentTime: item.media.duration, 
        duration: item.media.duration, 
        progress: 1, 
        isFinished: true, 
        lastUpdate: Date.now() 
    };
    handleProgressUpdate(finishedState);
    await absService.value.updateProgress(item.id, { isFinished: true });
    setTimeout(() => {
         fetchDashboardData();
    }, 2000);
  } catch (e) {
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

const hydrateList = (list: ABSLibraryItem[]) => {
  return list.map(item => {
    // Check global/local map
    const live = activeProgressMap.value.get(item.id);
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
        case 'continue-listening': currentlyReadingRaw.value = shelf.entities; break;
        case 'continue-series': continueSeriesRaw.value = shelf.entities; break;
        case 'recently-added':
        case 'newest-episodes': recentlyAddedRaw.value = shelf.entities; break;
        case 'recent-series': recentSeries.value = shelf.entities; break;
      }
    });
    isOfflineMode.value = false;
  } catch (e) {
    await handleOfflineFallback();
  }
};

const forceSyncProgress = async () => {
  if (isSyncing.value || !absService.value || isOfflineMode.value) return;
  isSyncing.value = true;
  syncFeedback.value = '';
  
  try {
    // 1. Force Server PUSH via Socket
    // Use the shared service instance to ensure the listener in App.vue catches the response
    absService.value.emitGetUserItems();
    
    // 2. Redundant API fetch to be safe
    const allProgress = await absService.value.getAllUserProgress();
    if (allProgress && Array.isArray(allProgress)) {
      allProgress.forEach(p => handleProgressUpdate(p, false));
    }

    // 3. Refresh shelves
    await fetchDashboardData();

    syncFeedback.value = "Synced";
    setTimeout(() => syncFeedback.value = '', 2000);
  } catch (e) {
    console.error("Manual sync failed", e);
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
  await initService();
  await initProgressMap(); 
  await fetchDashboardData();
  if (props.initialSeriesId) await nextTick(() => handleJumpToSeries(props.initialSeriesId!));
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
});

onActivated(async () => {
  if (props.initialSeriesId) await nextTick(() => handleJumpToSeries(props.initialSeriesId!));
});

onUnmounted(() => {
  if (!props.providedService) {
    absService.value?.disconnect();
  }
  window.removeEventListener('online', updateOnlineStatus);
  window.removeEventListener('offline', updateOnlineStatus);
});

const handleJumpToSeries = async (seriesId: string) => {
  if (!absService.value || isOfflineMode.value) return;
  if (selectedSeries.value?.id === seriesId) { activeTab.value = 'SERIES'; emit('clear-initial-series'); return; }
  try {
    const series = await absService.value.getSeries(seriesId);
    if (series) { selectedSeries.value = series; activeTab.value = 'SERIES'; emit('clear-initial-series'); }
  } catch (e) { emit('clear-initial-series'); }
};

const handleTabChange = (tab: LibraryTab) => {
  activeTab.value = tab;
  selectedSeries.value = null;
  searchTerm.value = ''; 
  if (tab === 'HOME') fetchDashboardData();
};

const handleScan = async () => {
  if (isScanning.value || !absService.value || isOfflineMode.value) return;
  isScanning.value = true;
  try { await absService.value.scanLibrary(); } finally { setTimeout(() => isScanning.value = false, 2000); }
};

const trimmedSearch = computed(() => searchTerm.value.trim());
const performGlobalSearch = async () => {
  if (!trimmedSearch.value || trimmedSearch.value.length < 2 || !absService.value || isOfflineMode.value) return;
  isGlobalSearching.value = true;
  try {
    const results = await absService.value.quickSearch(trimmedSearch.value);
    if (results) searchResults.value = results;
  } finally { isGlobalSearching.value = false; }
};

watch(trimmedSearch, () => {
  if (debounceTimeout) clearTimeout(debounceTimeout);
  if (!trimmedSearch.value) { searchResults.value = { books: [], series: [] }; return; }
  debounceTimeout = setTimeout(performGlobalSearch, 300);
});

const isHomeEmpty = computed(() => currentlyReadingRaw.value.length === 0 && recentlyAddedRaw.value.length === 0 && recentSeries.value.length === 0 && continueSeriesRaw.value.length === 0);
</script>

<template>
  <LibraryLayout :activeTab="activeTab" v-model:search="searchTerm" :isScanning="isScanning" :isStreaming="isStreaming" :username="auth.user?.username" @tab-change="handleTabChange" @logout="emit('logout')" @scan="handleScan">
    <div class="flex-1 min-h-0 h-full flex flex-col relative">
      <Transition name="slide-down">
        <div v-if="isOfflineMode" class="absolute top-0 left-0 right-0 z-50 bg-amber-600/90 backdrop-blur-md px-4 py-2 flex items-center justify-center gap-2 text-white shadow-lg">
          <WifiOff :size="14" />
          <span class="text-[10px] font-black uppercase tracking-widest">Offline Mode</span>
        </div>
      </Transition>

      <SeriesView v-if="selectedSeries && absService" :series="selectedSeries" :absService="absService" :auth="auth" :progressMap="activeProgressMap" @back="selectedSeries = null" @select-item="emit('select-item', $event)" />

      <template v-else>
        <div v-if="trimmedSearch" class="h-full bg-[#0d0d0d] overflow-y-auto custom-scrollbar px-4 md:px-8 pt-8 pb-40">
          <div class="mb-8 flex items-center gap-4">
            <h2 class="text-xl font-black uppercase tracking-tighter text-white">Search Results</h2>
            <Loader2 v-if="isGlobalSearching" class="animate-spin text-purple-500" :size="20" />
          </div>
          <template v-if="!isGlobalSearching">
            <section v-if="searchResults.series.length > 0 && absService" class="shelf-row border-t-0">
              <div class="shelf-tag"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Series</span></div>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                <div v-for="series in searchResults.series" :key="series.id">
                  <SeriesCard :series="series" :coverUrl="absService.getCoverUrl(series.books?.[0]?.id || '')" :bookCovers="series.books?.slice(0, 3).map(b => absService.getCoverUrl(b.id)) || []" @click="selectedSeries = series" />
                </div>
              </div>
            </section>
            <section v-if="searchResults.books.length > 0 && absService" class="shelf-row">
              <div class="shelf-tag"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Books</span></div>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                <BookCard v-for="item in searchResults.books" :key="item.id" :item="item" :coverUrl="absService.getCoverUrl(item.id)" show-metadata @click="emit('select-item', item)" />
              </div>
            </section>
          </template>
        </div>

        <template v-else>
          <div v-if="activeTab === 'HOME'" class="h-full bg-[#0d0d0d] overflow-y-auto custom-scrollbar -mx-4 md:-mx-8 px-4 md:px-8 pt-4 pb-40">
            <div :class="{ 'pt-8': isOfflineMode }"></div>
            <template v-if="!isHomeEmpty">
              <section v-if="hydratedCurrentlyReading.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag gap-3 pr-2">
                  <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Continue Listening</span>
                  <button @click="forceSyncProgress" class="p-1 text-purple-500 hover:text-purple-400 transition-colors rounded-full hover:bg-white/10 flex items-center gap-2" :disabled="isSyncing">
                    <RotateCw :size="12" :class="{ 'animate-spin': isSyncing }" />
                    <span v-if="syncFeedback" class="text-[8px] font-black uppercase tracking-widest text-white">{{ syncFeedback }}</span>
                  </button>
                </div>
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-10 pl-2">
                  <div v-for="item in hydratedCurrentlyReading" :key="item.id" class="w-32 md:w-40 shrink-0">
                    <BookCard :item="item" :coverUrl="absService.getCoverUrl(item.id)" show-metadata show-progress @click="emit('select-item', item)" @finish="handleMarkFinished" />
                  </div>
                </div>
              </section>
              <section v-if="hydratedContinueSeries.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Next in Series</span></div>
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-10 pl-2">
                  <div v-for="item in hydratedContinueSeries" :key="item.id" class="w-32 md:w-40 shrink-0">
                    <BookCard :item="item" :coverUrl="absService.getCoverUrl(item.id)" show-metadata @click="emit('select-item', item)" />
                  </div>
                </div>
              </section>
              <section v-if="hydratedRecentlyAdded.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Recently Added</span></div>
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-10 pl-2">
                  <div v-for="item in hydratedRecentlyAdded" :key="item.id" class="w-32 md:w-40 shrink-0">
                    <BookCard :item="item" :coverUrl="absService.getCoverUrl(item.id)" show-metadata @click="emit('select-item', item)" />
                  </div>
                </div>
              </section>
              <section v-if="recentSeries.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Series Stacks</span></div>
                <div class="flex gap-16 overflow-x-auto no-scrollbar pb-6 pl-4">
                  <div v-for="series in recentSeries" :key="series.id" class="w-44 md:w-56 shrink-0">
                    <SeriesCard :series="series" :coverUrl="absService.getCoverUrl(series.books?.[0]?.id || '')" :bookCovers="series.books?.slice(0, 3).map(b => absService.getCoverUrl(b.id)) || []" @click="selectedSeries = series" />
                  </div>
                </div>
              </section>
            </template>
            <div v-else class="flex flex-col items-center justify-center py-40 opacity-40">
              <PackageOpen :size="64" class="mb-6" />
              <h3 class="text-xl font-black uppercase tracking-tighter">Archive Void</h3>
            </div>
          </div>
          <div v-else-if="activeTab === 'LIBRARY' && absService" class="h-full flex flex-col overflow-hidden">
            <Bookshelf :absService="absService" :sortMethod="sortMethod" :desc="desc" :search="''" :progressMap="activeProgressMap" @select-item="emit('select-item', $event)" />
          </div>
          <div v-else-if="activeTab === 'SERIES' && absService" class="h-full flex flex-col overflow-hidden">
            <SeriesShelf :absService="absService" :sortMethod="sortMethod" :desc="desc" :search="''" @select-series="selectedSeries = $event" />
          </div>
          <div v-else-if="activeTab === 'REQUEST'" class="h-full flex flex-col overflow-hidden"><RequestPortal /></div>
          <div v-else-if="activeTab === 'STATS' && absService" class="h-full flex flex-col overflow-hidden"><StatsView :absService="absService" :progressMap="activeProgressMap" /></div>
        </template>
      </template>
    </div>
  </LibraryLayout>
</template>