
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
import SavedBooks from './SavedBooks.vue';
import BookCard from '../components/BookCard.vue';
import SeriesCard from '../components/SeriesCard.vue';
import { PackageOpen, Loader2, WifiOff, RotateCw, Heart } from 'lucide-vue-next';

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
  (e: 'select-item', item: ABSLibraryItem): void,
  (e: 'open-info', item: ABSLibraryItem): void,
  (e: 'logout'): void,
  (e: 'clear-initial-series'): void
}>();

const absService = ref<ABSService | null>(props.providedService || null);
const activeTab = ref<LibraryTab>('HOME');
const searchTerm = ref('');
const sortMethod = ref('addedAt'); 
const desc = ref(1);
const selectedSeries = ref<ABSSeries | null>(null);
const isScanning = ref(false);
const isOfflineMode = ref(!navigator.onLine);

const wishlistItems = ref<ABSLibraryItem[]>([]);
const currentlyReadingRaw = ref<ABSLibraryItem[]>([]);
const recentlyAddedRaw = ref<ABSLibraryItem[]>([]);
const recentSeries = ref<ABSSeries[]>([]);

const localProgressMap = reactive(new Map<string, ABSProgress>());
const activeProgressMap = computed(() => props.progressMap || localProgressMap);

const fetchWishlist = async () => {
  wishlistItems.value = await OfflineManager.getAllWishlisted();
};

const handleProgressUpdate = (p: ABSProgress, triggerEffects = true) => {
  const mapToUpdate = props.progressMap || localProgressMap;
  mapToUpdate.set(p.itemId, { ...p, lastUpdate: p.lastUpdate || Date.now() });
  if (triggerEffects) fetchDashboardData();
};

const fetchDashboardData = async () => {
  fetchWishlist();
  
  if (!absService.value) return;

  // Wait for library selection if not present
  if (!absService.value.libraryId) {
    await absService.value.getLibraries();
  }

  if (!absService.value.libraryId) {
    console.warn("No library ID available for fetching dashboard.");
    return;
  }

  if (!navigator.onLine) {
    const localBooks = await OfflineManager.getAllDownloadedBooks();
    currentlyReadingRaw.value = localBooks.filter(b => (b.userProgress?.progress || 0) > 0 && !b.userProgress?.isFinished);
    recentlyAddedRaw.value = localBooks;
    return;
  }

  try {
    const shelves = await absService.value.getPersonalizedShelves({ limit: 12 });
    if (shelves && Array.isArray(shelves)) {
      shelves.forEach((shelf: any) => {
        if (shelf.id === 'continue-listening') currentlyReadingRaw.value = shelf.entities || [];
        if (shelf.id === 'recently-added') recentlyAddedRaw.value = shelf.entities || [];
        if (shelf.id === 'recent-series') recentSeries.value = shelf.entities || [];
      });
    }
  } catch (e) { 
    console.warn("Dashboard fetch failed", e); 
  }
};

onMounted(async () => {
  if (!absService.value) {
    absService.value = new ABSService(props.auth.serverUrl, props.auth.user?.token || '', props.auth.user?.id, props.auth.user?.defaultLibraryId);
  }
  await fetchDashboardData();
  window.addEventListener('online', fetchDashboardData);
});

// Watch for libraryId changes to trigger re-fetch
watch(() => absService.value?.libraryId, (newId) => {
  if (newId) fetchDashboardData();
});

onActivated(fetchDashboardData);

const handleInfoClick = (item: ABSLibraryItem) => {
  emit('open-info', item);
};

const handleTabChange = (tab: LibraryTab) => {
  activeTab.value = tab;
  if (tab === 'HOME') fetchDashboardData();
};
</script>

<template>
  <LibraryLayout :activeTab="activeTab" v-model:search="searchTerm" :isScanning="isScanning" :isStreaming="isStreaming" :username="auth.user?.username" @tab-change="handleTabChange" @logout="emit('logout')" @scan="absService?.scanLibrary()">
    <div class="flex-1 min-h-0 h-full flex flex-col relative">
      <div v-if="activeTab === 'HOME'" class="h-full overflow-y-auto custom-scrollbar pt-4 pb-40">
        
        <!-- Empty State if no items found and not loading -->
        <div v-if="!currentlyReadingRaw.length && !recentlyAddedRaw.length && !wishlistItems.length" class="flex flex-col items-center justify-center py-40 opacity-30">
           <Loader2 class="animate-spin mb-4" :size="32" />
           <p class="text-[10px] font-black uppercase tracking-widest">Awaiting Artifact Response...</p>
        </div>

        <!-- Continue Listening -->
        <section v-if="currentlyReadingRaw.length > 0 && absService" class="shelf-row py-8">
          <div class="shelf-tag"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Continue Listening</span></div>
          <div class="flex gap-8 overflow-x-auto no-scrollbar pl-2 pb-8">
            <div v-for="item in currentlyReadingRaw" :key="item.id" class="w-32 md:w-40 shrink-0">
              <BookCard :item="item" :coverUrl="absService.getCoverUrl(item.id)" show-metadata show-progress @click="emit('select-item', item)" @info-click="handleInfoClick" />
            </div>
          </div>
        </section>

        <!-- Want To Listen (Wishlist) -->
        <section v-if="wishlistItems.length > 0 && absService" class="shelf-row py-8">
          <div class="shelf-tag border-l-purple-400 bg-purple-500/10 flex items-center gap-2">
            <Heart :size="10" fill="currentColor" class="text-purple-400" />
            <span class="text-[10px] font-black uppercase tracking-[0.3em] text-purple-400">Want To Listen</span>
          </div>
          <div class="flex gap-8 overflow-x-auto no-scrollbar pl-2 pb-8">
            <div v-for="item in wishlistItems" :key="item.id" class="w-32 md:w-40 shrink-0">
              <BookCard :item="item" :coverUrl="absService.getCoverUrl(item.id)" show-metadata @click="emit('select-item', item)" @info-click="handleInfoClick" />
            </div>
          </div>
        </section>

        <!-- Standard Shelves -->
        <section v-if="recentlyAddedRaw.length > 0 && absService" class="shelf-row py-8">
          <div class="shelf-tag"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-white">Recently Added</span></div>
          <div class="flex gap-8 overflow-x-auto no-scrollbar pl-2 pb-8">
            <div v-for="item in recentlyAddedRaw" :key="item.id" class="w-32 md:w-40 shrink-0">
              <BookCard :item="item" :coverUrl="absService.getCoverUrl(item.id)" show-metadata @click="emit('select-item', item)" @info-click="handleInfoClick" />
            </div>
          </div>
        </section>
      </div>

      <div v-else-if="activeTab === 'LIBRARY' && absService" class="h-full flex flex-col overflow-hidden">
        <Bookshelf :absService="absService" sortMethod="addedAt" :desc="1" :search="''" :progressMap="activeProgressMap" @select-item="emit('select-item', $event)" @info-click="handleInfoClick" />
      </div>
      <div v-else-if="activeTab === 'SAVED'" class="h-full flex flex-col overflow-hidden">
        <SavedBooks @select-item="emit('select-item', $event)" @info-click="handleInfoClick" />
      </div>
      <div v-else-if="activeTab === 'STATS' && absService" class="h-full flex flex-col overflow-hidden"><StatsView :absService="absService" :progressMap="activeProgressMap" /></div>
      <div v-else-if="activeTab === 'REQUEST'" class="h-full flex flex-col overflow-hidden"><RequestPortal /></div>
    </div>
  </LibraryLayout>
</template>
