<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { ABSService, LibraryQueryParams } from '../services/absService';
import BookCard from './BookCard.vue';
import { PackageOpen, Loader2, Plus } from 'lucide-vue-next';

const props = defineProps<{
  absService: ABSService,
  isStreaming?: boolean,
  sortMethod: string,
  desc: number,
  search?: string
}>();

const emit = defineEmits<{
  (e: 'select-item', item: ABSLibraryItem): void
}>();

const libraryItems = ref<ABSLibraryItem[]>([]);
const totalItems = ref(0);
const isLoading = ref(false);
const hasMore = ref(true);
const scrollContainerRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);

const ITEMS_PER_FETCH = 60;

/**
 * Maps human-readable sort keys to Audiobookshelf API expectations.
 */
const getMappedSortKey = (method: string) => {
  switch (method) {
    case 'Title': return 'media.metadata.title';
    case 'Author': return 'media.metadata.authorName';
    case 'Added': return 'addedAt';
    default: return method || 'addedAt';
  }
};

/**
 * Core fetch function with circuit breakers and unique-filtering.
 */
const fetchMoreItems = async (isInitial = false) => {
  // 1. Immediate Guards: Don't fetch if already loading or reached the end
  if (isLoading.value) return;
  if (!isInitial && !hasMore.value) return;

  isLoading.value = true;
  try {
    // 2. Strict Offset Calculation
    const fetchOffset = isInitial ? 0 : libraryItems.value.length;
    
    const params: LibraryQueryParams = {
      limit: ITEMS_PER_FETCH,
      offset: fetchOffset,
      sort: getMappedSortKey(props.sortMethod),
      desc: props.desc,
      search: props.search
    };
    
    const response = await props.absService.getLibraryItemsPaged(params);
    const results = response?.results || [];
    const total = response?.total || 0;

    // 3. Circuit Breaker: Empty Result Catch
    if (results.length === 0) {
      hasMore.value = false;
      totalItems.value = libraryItems.value.length;
      return;
    }

    if (isInitial) {
      libraryItems.value = results;
    } else {
      // 4. Duplicate Check / Unique Filtering
      const existingIds = new Set(libraryItems.value.map(i => i.id));
      const uniqueResults = results.filter(i => !existingIds.has(i.id));
      
      // If we got results but none are unique, the API might be looping; stop immediately
      if (uniqueResults.length === 0) {
        console.warn("Circuit Breaker: No new unique artifacts found in batch.");
        hasMore.value = false;
        totalItems.value = libraryItems.value.length;
        return;
      }
      
      libraryItems.value.push(...uniqueResults);
    }
    
    totalItems.value = total;
    
    // Check if we've consumed the entire total
    if (libraryItems.value.length >= total) {
      hasMore.value = false;
    }

    // 5. Fill-Screen Recursive Check (Strictly Guarded)
    await nextTick();
    const sentinel = sentinelRef.value;
    if (sentinel && hasMore.value && !isLoading.value) {
      const rect = sentinel.getBoundingClientRect();
      // If the sentinel is still inside the viewport, we need more content to enable scrolling
      if (rect.top < window.innerHeight + 200) {
        isLoading.value = false; // Allow recursive call to pass its own guard
        await fetchMoreItems(false);
      }
    }
  } catch (e) {
    console.error("Archive Transmission Error:", e);
    hasMore.value = false; // Safety stop on error
  } finally {
    isLoading.value = false;
  }
};

let observer: IntersectionObserver | null = null;
const setupObserver = () => {
  if (observer) observer.disconnect();
  if (!sentinelRef.value) return;

  // Root: null uses the entire viewport as the trigger area for reliability.
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading.value && hasMore.value) {
      fetchMoreItems();
    }
  }, { 
    threshold: 0,
    rootMargin: '200px',
    root: null 
  });
  
  observer.observe(sentinelRef.value);
};

const reset = async () => {
  if (observer) observer.disconnect();
  
  // Clean Reset State
  isLoading.value = false;
  hasMore.value = true;
  totalItems.value = 0;
  libraryItems.value = [];
  
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = 0;
  }
  
  // Initial Fetch
  await fetchMoreItems(true);
  await nextTick();
  setupObserver();
};

onMounted(async () => {
  await reset();

  // Progress update: update existing item without full reload
  props.absService.onProgressUpdate((updated: ABSProgress) => {
    const index = libraryItems.value.findIndex(i => i.id === updated.itemId);
    if (index !== -1) {
      libraryItems.value[index] = { ...libraryItems.value[index], userProgress: updated };
    }
  });

  props.absService.onLibraryUpdate(() => reset());
});

onUnmounted(() => {
  observer?.disconnect();
});

// Deep watch props for sorting/filtering changes
watch(() => [props.sortMethod, props.desc, props.search], () => reset(), { deep: true });
</script>

<template>
  <div class="flex-1 h-full min-h-0 flex flex-col overflow-hidden">
    <div ref="scrollContainerRef" class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-40 relative">
      
      <!-- Empty State -->
      <div v-if="libraryItems.length === 0 && !isLoading" class="flex flex-col items-center justify-center py-40 text-center opacity-40">
        <PackageOpen :size="64" class="text-neutral-800 mb-6" />
        <h3 class="text-xl font-black uppercase tracking-tighter">Archive Empty</h3>
        <p class="text-[9px] font-black uppercase tracking-widest mt-2">No artifacts detected in current frequency</p>
      </div>

      <!-- Bookshelf Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-12">
        <BookCard 
          v-for="item in libraryItems" 
          :key="item.id"
          :item="item"
          :coverUrl="absService.getCoverUrl(item.id)"
          show-metadata
          @click="emit('select-item', item)"
        />
      </div>

      <!-- Detection Sentinel -->
      <div ref="sentinelRef" class="h-24 w-full flex flex-col items-center justify-center mt-12 mb-24 gap-6">
        <!-- Spinner only shows when actually loading more -->
        <div v-if="isLoading && hasMore" class="flex flex-col items-center gap-4">
          <div class="w-8 h-8 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
          <p class="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-700">Accessing Index...</p>
        </div>
        
        <!-- Manual Fetch Fallback -->
        <button 
          v-if="!isLoading && hasMore && totalItems > 0"
          @click="fetchMoreItems()"
          class="flex items-center gap-3 px-6 py-3 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-[0.4em] text-neutral-500 hover:text-purple-400 hover:border-purple-500/20 transition-all active:scale-95"
        >
          <Plus :size="14" />
          <span>Load More</span>
        </button>

        <!-- Terminus -->
        <span v-else-if="!isLoading && !hasMore && libraryItems.length > 0" class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-800/20">
          INDEX TERMINUS REACHED
        </span>
      </div>
    </div>
  </div>
</template>