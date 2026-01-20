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
const scrollContainerRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);

// Batch size optimized for modern displays and reliability
const ITEMS_PER_FETCH = 60;

/**
 * Paged fetch function with self-correcting offset and recursive screen-fill logic
 */
const fetchMoreItems = async (isInitial = false) => {
  // Loading guard: stop if already loading or if we've reached the end
  if (isLoading.value || (!isInitial && totalItems.value > 0 && libraryItems.value.length >= totalItems.value)) {
    return;
  }

  isLoading.value = true;
  try {
    // Offset is self-correcting based on actual items rendered
    const fetchOffset = isInitial ? 0 : libraryItems.value.length;
    
    const params: LibraryQueryParams = {
      limit: ITEMS_PER_FETCH,
      offset: fetchOffset,
      sort: props.sortMethod,
      desc: props.desc,
      search: props.search
    };
    
    const { results, total } = await props.absService.getLibraryItemsPaged(params);
    
    if (isInitial) {
      libraryItems.value = results;
    } else {
      // Map-based deduplication
      const existingIds = new Set(libraryItems.value.map(i => i.id));
      const uniqueResults = results.filter(i => !existingIds.has(i.id));
      if (uniqueResults.length > 0) {
        libraryItems.value.push(...uniqueResults);
      }
    }
    totalItems.value = total;

    // Wait for DOM to update then check if we need to fill more screen space
    await nextTick();
    
    // Safety check: if the sentinel is still visible/near the viewport, trigger another fetch immediately
    const sentinel = sentinelRef.value;
    if (sentinel && libraryItems.value.length < totalItems.value) {
      const rect = sentinel.getBoundingClientRect();
      // If the sentinel is still near the viewport, force next fetch recursively
      if (rect.top < window.innerHeight + 1000) {
        console.log("Sentinel still visible/near, force-fetching next page...");
        isLoading.value = false; // Temporarily reset to allow recursion bypass
        await fetchMoreItems(false);
      }
    }
  } catch (e) {
    console.error("Archive fetch error:", e);
  } finally {
    isLoading.value = false;
  }
};

let observer: IntersectionObserver | null = null;
const setupObserver = () => {
  if (observer) observer.disconnect();
  if (!sentinelRef.value) return;

  // root: null defaults to the browser viewport for absolute reliability across nested layouts
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading.value) {
      if (totalItems.value === 0 || libraryItems.value.length < totalItems.value) {
        fetchMoreItems();
      }
    }
  }, { 
    threshold: 0, // Trigger as soon as the first pixel enters the root area
    rootMargin: '800px', // Fetch well before hitting bottom
    root: null 
  });
  
  observer.observe(sentinelRef.value);
};

const reset = async () => {
  // Prevent observer collisions during reset
  if (observer) observer.disconnect();
  
  libraryItems.value = [];
  totalItems.value = 0;
  
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = 0;
  }
  
  await fetchMoreItems(true);
  await nextTick();
  setupObserver();
};

onMounted(async () => {
  await reset();

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

// Re-initialize logic when filtering/sorting changes
watch(() => [props.sortMethod, props.desc, props.search], () => reset());
</script>

<template>
  <div class="flex-1 h-full min-h-0 flex flex-col overflow-hidden">
    <!-- Main scroll container -->
    <div ref="scrollContainerRef" class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-40 relative">
      
      <!-- Empty State -->
      <div v-if="libraryItems.length === 0 && !isLoading" class="flex flex-col items-center justify-center py-40 text-center opacity-40">
        <PackageOpen :size="64" class="text-neutral-800 mb-6" />
        <h3 class="text-xl font-black uppercase tracking-tighter">No artifacts found</h3>
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

      <!-- Detection Sentinel: Direct sibling to grid, within scroll container -->
      <div ref="sentinelRef" class="h-24 w-full flex flex-col items-center justify-center mt-12 mb-24 gap-6">
        <div v-if="isLoading" class="flex flex-col items-center gap-4">
          <Loader2 class="animate-spin text-purple-500" :size="32" />
          <p class="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-700">Accessing Index...</p>
        </div>
        
        <!-- Manual Fetch Fallback -->
        <button 
          v-if="!isLoading && libraryItems.length < totalItems && totalItems > 0"
          @click="fetchMoreItems()"
          class="flex items-center gap-3 px-6 py-3 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-[0.4em] text-neutral-500 hover:text-purple-400 hover:border-purple-500/20 transition-all active:scale-95"
        >
          <Plus :size="14" />
          <span>Load More (Manual)</span>
        </button>

        <span v-else-if="!isLoading && libraryItems.length >= totalItems && totalItems > 0" class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-800/20">
          INDEX TERMINUS REACHED
        </span>
      </div>
    </div>
  </div>
</template>