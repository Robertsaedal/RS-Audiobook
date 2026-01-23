
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { ABSService, LibraryQueryParams } from '../services/absService';
import { OfflineManager } from '../services/offlineManager';
import BookCard from './BookCard.vue';
import { PackageOpen, Loader2, Plus, AlertTriangle, FastForward, RotateCw } from 'lucide-vue-next';

const props = defineProps<{
  absService: ABSService,
  isStreaming?: boolean,
  sortMethod: string,
  desc: number,
  search?: string,
  progressMap?: Map<string, ABSProgress>
}>();

const emit = defineEmits<{
  (e: 'select-item', item: ABSLibraryItem): void,
  (e: 'info-click', item: ABSLibraryItem): void
}>();

const libraryItems = ref<ABSLibraryItem[]>([]);
const totalItems = ref(0);
const internalOffset = ref(0);
const isLoading = ref(false);
const hasMore = ref(true);
const duplicateWallDetected = ref(false);
const scrollContainerRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);
const isOffline = ref(false);

const hydratedItems = computed(() => {
  if (!props.progressMap) return libraryItems.value;
  return libraryItems.value.map(item => {
    const local = props.progressMap!.get(item.id);
    if (local) return { ...item, userProgress: local };
    return item;
  });
});

const requestedOffsets = new Set<number>();
const ITEMS_PER_FETCH = 60;

const getMappedSortKey = (method: string) => {
  const m = method.toLowerCase();
  if (m === 'added' || m === 'addedat') return 'addedAt';
  if (m === 'updated' || m === 'updatedat') return 'updatedAt';
  if (m === 'title' || m.includes('metadata.title')) return 'media.metadata.title';
  if (m === 'author' || m.includes('metadata.author')) return 'media.metadata.authorName';
  return method || 'addedAt';
};

const fetchOfflineBooks = async () => {
  isLoading.value = true;
  isOffline.value = true;
  try {
    const localItems = await OfflineManager.getAllDownloadedBooks();
    libraryItems.value = localItems;
    totalItems.value = localItems.length;
    hasMore.value = false;
  } catch (e) {
    console.error("Failed to load offline books", e);
  } finally {
    isLoading.value = false;
  }
};

const fetchMoreItems = async (isInitial = false) => {
  if (!navigator.onLine) {
    if (isInitial) await fetchOfflineBooks();
    return;
  }
  const fetchOffset = isInitial ? 0 : internalOffset.value;
  if (isLoading.value || (!isInitial && !hasMore.value) || (requestedOffsets.has(fetchOffset) && !isInitial)) return;

  isLoading.value = true;
  duplicateWallDetected.value = false;
  requestedOffsets.add(fetchOffset);

  try {
    const sortKey = getMappedSortKey(props.sortMethod);
    const params: LibraryQueryParams = {
      limit: ITEMS_PER_FETCH,
      offset: fetchOffset,
      sort: sortKey,
      desc: props.desc,
      search: props.search
    };
    
    const response = await props.absService.getLibraryItemsPaged(params);
    const results = response?.results || [];
    const total = response?.total || 0;
    
    totalItems.value = total;
    isOffline.value = false;
    if (results.length === 0) {
      hasMore.value = false;
      return;
    }
    internalOffset.value = fetchOffset + ITEMS_PER_FETCH;

    if (isInitial) {
      libraryItems.value = results;
    } else {
      const existingIds = new Set(libraryItems.value.map(i => i.id));
      const uniqueResults = results.filter(i => !existingIds.has(i.id));
      if (uniqueResults.length > 0) libraryItems.value.push(...uniqueResults);
      else duplicateWallDetected.value = true;
    }
    
    if (libraryItems.value.length >= totalItems.value || internalOffset.value >= totalItems.value) hasMore.value = false;
    await nextTick();
    const sentinel = sentinelRef.value;
    if (sentinel && hasMore.value && !isLoading.value && !duplicateWallDetected.value) {
      const rect = sentinel.getBoundingClientRect();
      if (rect.top < window.innerHeight + 1000) setTimeout(() => fetchMoreItems(false), 100);
    }
  } catch (e) {
    if (isInitial) await fetchOfflineBooks();
    else hasMore.value = false; 
  } finally {
    isLoading.value = false;
  }
};

let observer: IntersectionObserver | null = null;
const setupObserver = () => {
  if (observer) observer.disconnect();
  if (!sentinelRef.value) return;
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading.value && hasMore.value && !isOffline.value) fetchMoreItems();
  }, { threshold: 0, rootMargin: '1000px', root: null });
  observer.observe(sentinelRef.value);
};

const reset = async () => {
  if (observer) observer.disconnect();
  requestedOffsets.clear();
  isLoading.value = false;
  hasMore.value = true;
  duplicateWallDetected.value = false;
  totalItems.value = 0;
  internalOffset.value = 0;
  libraryItems.value = [];
  isOffline.value = false;
  if (scrollContainerRef.value) scrollContainerRef.value.scrollTop = 0;
  await nextTick();
  await fetchMoreItems(true);
  await nextTick();
  setupObserver();
};

onMounted(async () => {
  await reset();
  props.absService.onLibraryUpdate(() => reset());
});

onUnmounted(() => observer?.disconnect());
watch(() => [props.sortMethod, props.desc, props.search], () => reset(), { deep: true });
</script>

<template>
  <div class="flex-1 h-full min-h-0 flex flex-col overflow-hidden">
    <div ref="scrollContainerRef" class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-40 relative">
      <div v-if="isOffline" class="py-4 text-center">
        <span class="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500">Offline Library • Downloaded Items Only</span>
      </div>

      <div v-if="hydratedItems.length === 0 && !isLoading" class="flex flex-col items-center justify-center py-40 text-center opacity-40">
        <PackageOpen :size="64" class="text-neutral-800 mb-6" />
        <h3 class="text-xl font-black uppercase tracking-tighter">Archive Empty</h3>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-12">
        <BookCard 
          v-for="item in hydratedItems" 
          :key="item.id"
          :item="item"
          :coverUrl="absService.getCoverUrl(item.id)"
          show-metadata
          @click="emit('select-item', item)"
          @info-click="emit('info-click', item)"
        />
      </div>

      <div ref="sentinelRef" class="h-24 w-full flex flex-col items-center justify-center mt-12 mb-24 gap-6">
        <div v-if="isLoading" class="flex flex-col items-center gap-4">
          <div class="w-8 h-8 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
        </div>
        <button 
          v-else-if="!isLoading && hasMore && totalItems > 0 && !isOffline"
          @click="fetchMoreItems()"
          class="flex items-center gap-3 px-6 py-3 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-[0.4em] text-neutral-500 hover:text-purple-400"
        >
          <Plus :size="14" />
          <span>Sync More</span>
        </button>
      </div>
    </div>
  </div>
</template>
