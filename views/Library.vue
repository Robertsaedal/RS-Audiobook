<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
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
import { PackageOpen, Loader2, WifiOff } from 'lucide-vue-next';

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

const currentlyReading = ref<ABSLibraryItem[]>([]);
const continueSeries = ref<ABSLibraryItem[]>([]);
const recentlyAdded = ref<ABSLibraryItem[]>([]);
const recentSeries = ref<ABSSeries[]>([]);

// Search State
const searchResults = ref<{ books: ABSLibraryItem[], series: ABSSeries[] }>({ books: [], series: [] });
const isGlobalSearching = ref(false);
let debounceTimeout: any = null;

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
  if (!found && !progress.isFinished && !progress.hideFromContinueListening && !isOfflineMode.value) {
    fetchDashboardData();
  }
};

const handleMarkFinished = async (item: ABSLibraryItem) => {
  if (isOfflineMode.value) {
    // Offline optimistic update not fully persisted to server yet
    currentlyReading.value = currentlyReading.value.filter(i => i.id !== item.id);
    return;
  }
  
  if (!absService.value) return;
  try {
    // Optimistic UI update
    currentlyReading.value = currentlyReading.value.filter(i => i.id !== item.id);
    await absService.value.updateProgress(item.id, { isFinished: true });
  } catch (e) {
    console.error("Failed to mark as finished", e);
    fetchDashboardData();
  }
};

const handleOfflineFallback = async () => {
  console.log("Entering Offline Mode Fallback");
  isOfflineMode.value = true;
  
  const localBooks = await OfflineManager.getAllDownloadedBooks();
  
  // Populate "Continue Listening" with in-progress downloads
  currentlyReading.value = localBooks.filter(b => {
    const p = b.userProgress;
    return p && p.progress > 0 && !p.isFinished;
  });

  // Populate "Recently Added" with all other downloads for easy access
  recentlyAdded.value = localBooks.filter(b => {
    const p = b.userProgress;
    return !p || p.progress === 0 || p.isFinished;
  });

  continueSeries.value = [];
  recentSeries.value = [];
};

const fetchDashboardData = async () => {
  if (!navigator.onLine) {
    await handleOfflineFallback();
    return;
  }

  if (!absService.value) return;
  try {
    // Official Strategy: Use server personalized shelves endpoint exclusively
    const shelves = await absService.value.getPersonalizedShelves({ limit: 12 });
    
    if (!shelves || !Array.isArray(shelves)) return;

    // Reset buckets
    currentlyReading.value = [];
    continueSeries.value = [];
    recentlyAdded.value = [];
    recentSeries.value = [];

    shelves.forEach((shelf: any) => {
      switch (shelf.id) {
        case 'continue-listening':
          currentlyReading.value = shelf.entities;
          break;
        case 'continue-series':
          continueSeries.value = shelf.entities;
          break;
        case 'recently-added':
        case 'newest-episodes': // Fallback for podcasts if recently-added missing
          recentlyAdded.value = shelf.entities;
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

const updateOnlineStatus = () => {
  const online = navigator.onLine;
  isOfflineMode.value = !online;
  if (online) {
    initService();
    fetchDashboardData();
  } else {
    handleOfflineFallback();
  }
};

onMounted(async () => {
  initService();
  await fetchDashboardData();
  
  // Handle initial series jump if provided via props (from Player)
  if (props.initialSeriesId) {
    await nextTick(); // Ensure service is ready
    handleJumpToSeries(props.initialSeriesId);
  }
  
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
});

onUnmounted(() => {
  absService.value?.disconnect();
  window.removeEventListener('online', updateOnlineStatus);
  window.removeEventListener('offline', updateOnlineStatus);
});

const handleJumpToSeries = async (seriesId: string) => {
  if (!absService.value || isOfflineMode.value) return;
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
  initService();
  fetchDashboardData();
});

const handleTabChange = (tab: LibraryTab) => {
  activeTab.value = tab;
  selectedSeries.value = null;
  searchTerm.value = ''; // Clear search when switching tabs
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
  return currentlyReading.value.length === 0 && recentlyAdded.value.length === 0 && recentSeries.value.length === 0 && continueSeries.value.length === 0;
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
        :series="selectedSeries" :absService="absService"
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
              <section v-if="currentlyReading.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag">
                  <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">
                    {{ isOfflineMode ? 'In Progress (Local)' : 'Continue Listening' }}
                  </span>
                </div>
                <!-- Increased gap-10 for better separation -->
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-10 pl-2">
                  <div v-for="item in currentlyReading" :key="item.id" class="w-32 md:w-40 shrink-0">
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

              <section v-if="continueSeries.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag">
                  <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Next in Series</span>
                </div>
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-10 pl-2">
                  <div v-for="item in continueSeries" :key="item.id" class="w-32 md:w-40 shrink-0">
                    <BookCard 
                      :item="item" 
                      :coverUrl="absService.getCoverUrl(item.id)" 
                      show-metadata
                      @click="emit('select-item', item)" 
                    />
                  </div>
                </div>
              </section>

              <section v-if="recentlyAdded.length > 0 && absService" class="shelf-row py-8">
                <div class="shelf-tag">
                  <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">
                    {{ isOfflineMode ? 'Downloaded' : 'Recently Added' }}
                  </span>
                </div>
                <div class="flex gap-10 overflow-x-auto no-scrollbar pb-10 pl-2">
                  <div v-for="item in recentlyAdded" :key="item.id" class="w-32 md:w-40 shrink-0">
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
            <Bookshelf :absService="absService" :sortMethod="sortMethod" :desc="desc" :search="''" @select-item="emit('select-item', $event)" />
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