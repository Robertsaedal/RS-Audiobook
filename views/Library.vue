
<script setup lang="ts">
import { ref, onMounted, onUnmounted, onActivated, watch, computed, nextTick, reactive } from 'vue';
import { AuthState, ABSLibraryItem, ABSSeries, ABSProgress } from '../types';
import { ABSService } from '../services/absService';
import { OfflineManager } from '../services/offlineManager';
import LibraryLayout, { LibraryTab } from '../components/LibraryLayout.vue';
import Bookshelf from '../components/Bookshelf.vue';
import SeriesShelf from '../components/SeriesShelf.vue';
import SeriesView from './SeriesView.vue';
import SavedView from './SavedView.vue';
import RequestPortal from '../components/RequestPortal.vue';
import StatsView from './StatsView.vue';
import BookCard from '../components/BookCard.vue';
import SeriesCard from '../components/SeriesCard.vue';
import { PackageOpen, Loader2, WifiOff, RotateCw, X, Heart, Play, Mic, Clock, Layers, Calendar, ArrowRight } from 'lucide-vue-next';

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
const seriesSortMethod = ref('lastBookAdded'); 
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
const wishlistRaw = ref<ABSLibraryItem[]>([]); 

// Info Modal State
const selectedInfoItem = ref<ABSLibraryItem | null>(null);
const isInfoItemWishlisted = ref(false);

const localProgressMap = reactive(new Map<string, ABSProgress>());
const activeProgressMap = computed(() => props.progressMap || localProgressMap);

const searchResults = ref<{ books: ABSLibraryItem[], series: ABSSeries[] }>({ books: [], series: [] });
const isGlobalSearching = ref(false);
let debounceTimeout: any = null;

// --- Navigation Guard ---
const onPopState = (event: PopStateEvent) => {
  const hash = window.location.hash;
  
  // Handle Info Modal Back
  if (selectedInfoItem.value && hash !== '#info') {
    selectedInfoItem.value = null;
  }
  
  // Handle Series View Back
  // We close Series view if hash is NOT #series, NOT #info, and NOT #player
  // (We check #player because if we go forward to player, we keep series open in background)
  if (selectedSeries.value) {
    if (hash !== '#series' && hash !== '#info' && !hash.startsWith('#player')) {
      selectedSeries.value = null;
      emit('clear-initial-series');
    }
  }
};

const initProgressMap = async () => {
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

  setupListeners();
};

const setupListeners = () => {
  if (!absService.value) return;

  absService.value.onLibraryUpdate(() => fetchDashboardData());
  
  if (!props.providedService) {
    absService.value.onProgressUpdate((p) => handleProgressUpdate(p));
    absService.value.onUserOnline((p) => handleProgressUpdate(p as ABSProgress));
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
  wishlistRaw.value = await OfflineManager.getWishlistBooks();
  continueSeriesRaw.value = [];
  recentSeries.value = [];
};

const hydrateList = (list: ABSLibraryItem[]) => {
  return list.map(item => {
    const live = activeProgressMap.value.get(item.id);
    return live ? { ...item, userProgress: live } : item;
  });
};

const hydratedCurrentlyReading = computed(() => hydrateList(currentlyReadingRaw.value));
const hydratedContinueSeries = computed(() => hydrateList(continueSeriesRaw.value));
const hydratedRecentlyAdded = computed(() => hydrateList(recentlyAddedRaw.value));
const hydratedWishlist = computed(() => hydrateList(wishlistRaw.value));

const fetchDashboardData = async () => {
  wishlistRaw.value = await OfflineManager.getWishlistBooks();

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
    absService.value.emitGetUserItems();
    const allProgress = await absService.value.getAllUserProgress();
    if (allProgress && Array.isArray(allProgress)) {
      allProgress.forEach(p => handleProgressUpdate(p, false));
    }
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

// --- Info Modal Logic ---
const openInfoModal = async (item: ABSLibraryItem) => {
  window.history.pushState({ modal: 'info' }, '', '#info');
  selectedInfoItem.value = item;
  isInfoItemWishlisted.value = await OfflineManager.isWishlisted(item.id);
};

const closeInfoModal = () => {
  if (window.location.hash === '#info') {
    window.history.back();
  } else {
    selectedInfoItem.value = null;
  }
};

const toggleWishlist = async () => {
  if (!selectedInfoItem.value) return;
  const newState = await OfflineManager.toggleWishlist(selectedInfoItem.value);
  isInfoItemWishlisted.value = newState;
  await fetchDashboardData();
};

const playFromModal = () => {
  if (selectedInfoItem.value) {
    emit('select-item', selectedInfoItem.value);
    closeInfoModal();
  }
};

const handleSeriesClickFromModal = async (seriesId: string) => {
  closeInfoModal();
  await handleJumpToSeries(seriesId);
};

const secondsToTimestamp = (s: number) => {
  if (isNaN(s) || s < 0) return "00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${sec.toString().padStart(2, '0')}`;
};

const modalInfoRows = computed(() => {
  if (!selectedInfoItem.value) return [];
  const m = selectedInfoItem.value.media.metadata;
  
  // NARRATOR LOGIC: Check Name -> Narrators Array -> Fallback
  let narrator = m.narratorName;
  if (!narrator && (m as any).narrators && Array.isArray((m as any).narrators) && (m as any).narrators.length > 0) {
    narrator = (m as any).narrators.join(', ');
  }
  if (!narrator) narrator = 'Multi-cast'; // Fallback if still empty

  // YEAR LOGIC: Check publishedYear -> publishedDate
  let year = m.publishedYear ? String(m.publishedYear) : null;
  if (!year && (m as any).publishedDate) {
    year = String((m as any).publishedDate).substring(0, 4);
  }

  // SERIES LOGIC: Check root seriesId, or extract from series array
  // Priority: 1. Root ID (simplest) 2. ID from array 3. Match from Series Name if possible
  const seriesId = m.seriesId || (Array.isArray((m as any).series) && (m as any).series.length > 0 ? (m as any).series[0].id : null);
  
  // Display Name logic: Prefer explicit name, then array name
  const seriesName = m.seriesName || (Array.isArray((m as any).series) && (m as any).series.length > 0 ? (m as any).series[0].name : null);

  const rows = [
    { label: 'Narrator', value: narrator || 'Unknown', icon: Mic },
    { label: 'Duration', value: secondsToTimestamp(selectedInfoItem.value.media.duration), icon: Clock },
    { label: 'Year', value: year || 'Unknown', icon: Calendar }
  ];

  // Only add Series row if we have a Name (even if ID is missing we show text, though click might fail if no ID)
  // We prioritize having an ID for the click action.
  if (seriesId && seriesName) {
    rows.splice(1, 0, { 
      label: 'Series', 
      value: seriesName, 
      icon: Layers,
      isAction: true,
      actionId: seriesId
    } as any);
  } else if (seriesName) {
      // Fallback: Show Series Name even if we can't route (no ID found)
       rows.splice(1, 0, { 
        label: 'Series', 
        value: seriesName, 
        icon: Layers,
        isAction: false 
      } as any);
  }

  return rows;
});

onMounted(async () => {
  await initService();
  await initProgressMap(); 
  await fetchDashboardData();
  if (props.initialSeriesId) await nextTick(() => handleJumpToSeries(props.initialSeriesId!));
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  window.addEventListener('popstate', onPopState);
});

onActivated(async () => {
  wishlistRaw.value = await OfflineManager.getWishlistBooks();
  if (props.initialSeriesId) await nextTick(() => handleJumpToSeries(props.initialSeriesId!));
});

onUnmounted(() => {
  if (!props.providedService) {
    absService.value?.disconnect();
  }
  window.removeEventListener('online', updateOnlineStatus);
  window.removeEventListener('offline', updateOnlineStatus);
  window.removeEventListener('popstate', onPopState);
});

const handleJumpToSeries = async (seriesId: string) => {
  if (!absService.value || isOfflineMode.value) return;
  
  // Guard against duplicate navigation or overwriting
  if (selectedSeries.value?.id === seriesId) return;

  try {
    const series = await absService.value.getSeries(seriesId);
    if (series) {
      // Manually manage history for series navigation
      if (window.location.hash !== '#series') {
        window.history.pushState({ series: true }, '', '#series');
      }
      selectedSeries.value = series;
      activeTab.value = 'SERIES';
      emit('clear-initial-series'); 
    }
  } catch (e) { emit('clear-initial-series'); }
};

const handleSelectSeries = (series: ABSSeries) => {
  window.history.pushState({ series: true }, '', '#series');
  selectedSeries.value = series;
};

const closeSeries = () => {
  if (window.location.hash === '#series') {
    window.history.back();
  } else {
    selectedSeries.value = null;
  }
};

const handleTabChange = (tab: LibraryTab) => {
  activeTab.value = tab;
  // If we change tabs manually, ensure we clear series if we were in one, but only if not just browsing
  if (selectedSeries.value) {
    selectedSeries.value = null;
    // We could clean up history here, but it's complex without router. 
    // Usually user uses back button to exit series.
  }
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

const isHomeEmpty = computed(() => currentlyReadingRaw.value.length === 0 && recentlyAddedRaw.value.length === 0 && recentSeries.value.length === 0 && continueSeriesRaw.value.length === 0 && wishlistRaw.value.length === 0);
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

      <SeriesView v-if="selectedSeries && absService" :series="selectedSeries" :absService="absService" :auth="auth" :progressMap="activeProgressMap" @back="closeSeries" @select-item="emit('select-item', $event)" @click-info="openInfoModal" />

      <template v-else>
        <div v-if="trimmedSearch" class="h-full bg-[#0d0d0d] overflow-y-auto custom-scrollbar pt-8 pb-40">
          <div class="mb-8 flex items-center gap-4">
            <h2 class="text-xl font-black uppercase tracking-tighter text-white">Search Results</h2>
            <Loader2 v-if="isGlobalSearching" class="animate-spin text-purple-500" :size="20" />
          </div>
          <template v-if="!isGlobalSearching">
            <section v-if="searchResults.series.length > 0 && absService" class="shelf-row border-t-0">
              <div class="shelf-tag"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Series</span></div>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                <div v-for="series in searchResults.series" :key="series.id">
                  <SeriesCard :series="series" :coverUrl="absService.getCoverUrl(series.books?.[0]?.id || '')" :bookCovers="series.books?.slice(0, 3).map(b => absService.getCoverUrl(b.id)) || []" @click="handleSelectSeries(series)" />
                </div>
              </div>
            </section>
            <section v-if="searchResults.books.length > 0 && absService" class="shelf-row">
              <div class="shelf-tag"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Books</span></div>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                <BookCard v-for="item in searchResults.books" :key="item.id" :item="item" :coverUrl="absService.getCoverUrl(item.id)" show-metadata @click="emit('select-item', item)" @click-info="openInfoModal" />
              </div>
            </section>
          </template>
        </div>

        <template v-else>
          <div v-if="activeTab === 'HOME'" class="h-full bg-[#0d0d0d] overflow-y-auto custom-scrollbar pt-4 pb-40">
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
                    <BookCard :item="item" :coverUrl="absService.getCoverUrl(item.id)" show-metadata show-progress @click="emit('select-item', item)" @finish="handleMarkFinished" @click-info="openInfoModal" />
                  </div>
                </div>
              </section>

              <!-- Want to Listen Shelf -->
              <section v-if="hydratedWishlist.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag gap-2">
                  <Heart :size="12" class="text-pink-500 fill-current" />
                  <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Want to Listen</span>
                </div>
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-10 pl-2">
                  <div v-for="item in hydratedWishlist" :key="item.id" class="w-32 md:w-40 shrink-0">
                    <BookCard :item="item" :coverUrl="absService.getCoverUrl(item.id)" show-metadata @click="emit('select-item', item)" @click-info="openInfoModal" />
                  </div>
                </div>
              </section>

              <section v-if="hydratedContinueSeries.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Next in Series</span></div>
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-10 pl-2">
                  <div v-for="item in hydratedContinueSeries" :key="item.id" class="w-32 md:w-40 shrink-0">
                    <BookCard :item="item" :coverUrl="absService.getCoverUrl(item.id)" show-metadata @click="emit('select-item', item)" @click-info="openInfoModal" />
                  </div>
                </div>
              </section>
              <section v-if="hydratedRecentlyAdded.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Recently Added</span></div>
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-10 pl-2">
                  <div v-for="item in hydratedRecentlyAdded" :key="item.id" class="w-32 md:w-40 shrink-0">
                    <BookCard :item="item" :coverUrl="absService.getCoverUrl(item.id)" show-metadata @click="emit('select-item', item)" @click-info="openInfoModal" />
                  </div>
                </div>
              </section>
              <section v-if="recentSeries.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Recent Series</span></div>
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-6 pl-2">
                  <div v-for="series in recentSeries" :key="series.id" class="w-32 md:w-40 shrink-0">
                    <SeriesCard :series="series" :coverUrl="absService.getCoverUrl(series.books?.[0]?.id || '')" :bookCovers="series.books?.slice(0, 3).map(b => absService.getCoverUrl(b.id)) || []" @click="handleSelectSeries(series)" />
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
            <Bookshelf :absService="absService" :sortMethod="sortMethod" :desc="desc" :search="''" :progressMap="activeProgressMap" @select-item="emit('select-item', $event)" @click-info="openInfoModal" />
          </div>
          <div v-else-if="activeTab === 'SAVED' && absService" class="h-full flex flex-col overflow-hidden">
             <SavedView :absService="absService" :progressMap="activeProgressMap" @select-item="emit('select-item', $event)" @click-info="openInfoModal" />
          </div>
          <div v-else-if="activeTab === 'SERIES' && absService" class="h-full flex flex-col overflow-hidden">
            <SeriesShelf :absService="absService" :sortMethod="seriesSortMethod" :desc="desc" :search="''" @select-series="handleSelectSeries" />
          </div>
          <div v-else-if="activeTab === 'REQUEST'" class="h-full flex flex-col overflow-hidden"><RequestPortal /></div>
          <div v-else-if="activeTab === 'STATS' && absService" class="h-full flex flex-col overflow-hidden"><StatsView :absService="absService" :progressMap="activeProgressMap" /></div>
        </template>
      </template>
    </div>

    <!-- Info Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="selectedInfoItem && absService" class="fixed inset-0 z-[201] bg-black/95 backdrop-blur-3xl flex flex-col p-4 md:p-8 overflow-hidden safe-top safe-bottom">
          <div class="flex justify-between items-center mb-4 shrink-0">
            <h2 class="text-xl md:text-2xl font-black uppercase tracking-tighter text-white">Artifact Data</h2>
            <button @click="closeInfoModal" class="p-3 bg-neutral-900 rounded-full text-neutral-500 hover:text-white transition-colors border border-white/5 shadow-xl hover:bg-neutral-800">
              <X :size="20" />
            </button>
          </div>
          
          <div class="flex-1 overflow-y-auto custom-scrollbar pb-32">
            <div class="max-w-2xl mx-auto space-y-8">
              <div class="flex flex-col items-center text-center space-y-4">
                <div class="w-32 h-48 md:w-40 md:h-60 rounded-lg shadow-2xl overflow-hidden border border-white/10">
                  <img :src="absService.getCoverUrl(selectedInfoItem.id)" class="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 class="text-xl md:text-2xl font-black uppercase leading-tight">{{ selectedInfoItem.media.metadata.title }}</h3>
                  <p class="text-neutral-500 font-bold">{{ selectedInfoItem.media.metadata.authorName }}</p>
                </div>
              </div>

              <div v-if="selectedInfoItem.media.metadata.description" class="space-y-2">
                <h4 class="text-[10px] font-black uppercase tracking-widest text-neutral-600">Summary</h4>
                <div class="text-neutral-300 text-sm leading-relaxed whitespace-pre-line" v-html="selectedInfoItem.media.metadata.description"></div>
              </div>

              <!-- Enhanced Info Grid (Pills) -->
              <div class="grid grid-cols-2 gap-4">
                <component 
                  :is="row.isAction ? 'button' : 'div'"
                  v-for="(row, i) in modalInfoRows" 
                  :key="i" 
                  class="p-4 rounded-2xl flex flex-col gap-1 text-left transition-all relative overflow-hidden"
                  :class="[
                    row.isAction 
                      ? 'bg-purple-600 border border-purple-500/50 hover:bg-purple-500 cursor-pointer group active:scale-95 shadow-lg shadow-purple-900/20' 
                      : 'bg-white/5 border border-white/5'
                  ]"
                  @click="row.isAction ? handleSeriesClickFromModal(row.actionId) : null"
                >
                  <div class="flex items-center gap-2 mb-1" :class="row.isAction ? 'text-purple-200' : 'text-neutral-500'">
                    <component :is="row.icon" :size="12" />
                    <span class="text-[9px] font-black uppercase tracking-widest">{{ row.label }}</span>
                  </div>
                  <div class="flex items-center justify-between w-full">
                     <span class="text-sm font-bold truncate w-full" :class="row.isAction ? 'text-white' : 'text-white'">{{ row.value }}</span>
                     <ArrowRight v-if="row.isAction" :size="16" class="text-white transition-transform group-hover:translate-x-1" />
                  </div>
                </component>
              </div>

              <!-- Actions -->
              <div class="grid grid-cols-2 gap-4 pt-4">
                 <button 
                   @click="playFromModal"
                   class="py-4 bg-purple-600 rounded-2xl font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                 >
                    <Play :size="16" fill="currentColor" /> Play
                 </button>
                 <button 
                   @click="toggleWishlist"
                   class="py-4 bg-neutral-900 border border-white/10 rounded-2xl font-black uppercase tracking-widest text-neutral-400 hover:text-pink-400 hover:border-pink-500/30 transition-all flex items-center justify-center gap-2 active:scale-95"
                   :class="{ 'text-pink-500 border-pink-500/50 bg-pink-500/10': isInfoItemWishlisted }"
                 >
                    <Heart :size="16" :fill="isInfoItemWishlisted ? 'currentColor' : 'none'" /> 
                    {{ isInfoItemWishlisted ? 'Wishlisted' : 'Want to Listen' }}
                 </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </LibraryLayout>
</template>
