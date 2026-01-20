<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { ABSService, LibraryQueryParams } from '../services/absService';
import BookCard from './BookCard.vue';
import { PackageOpen, Loader2 } from 'lucide-vue-next';

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

// Increased batch size to ensure scrollbars appear on large screens
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
    // Reliable offset logic based on actual rendered items
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
      // Robust deduplication using ID map
      const existingIds = new Set(libraryItems.value.map(i => i.id));
      const uniqueResults = results.filter(i => !existingIds.has(i.id));
      if (uniqueResults.length > 0) {
        libraryItems.value.push(...uniqueResults);
      }
    }
    totalItems.value = total;

    // Container Height Check: If new content didn't fill the screen, fetch more immediately
    await nextTick();
    if (libraryItems.value.length < totalItems.value && scrollContainerRef.value) {
      const container = scrollContainerRef.value;
      // If scroll height is equal to or less than client height, no scrollbar exists
      if (container.scrollHeight <= container.clientHeight + 50) {
        isLoading.value = false; // Reset to allow recursive call
        await fetchMoreItems(false);
      }
    }
  } catch (e) {
    console.error("Failed to fetch library items", e);
  } finally {
    isLoading.value = false;
  }
};

const reset = async () => {
  libraryItems.value = [];
  totalItems.value = 0;
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = 0;
  }
  await fetchMoreItems(true);
  await nextTick();
  setupObserver();
};

let observer: IntersectionObserver | null = null;
const setupObserver = () => {
  if (observer) observer.disconnect();
  
  // Explicitly use scrollContainerRef.value as root
  if (!scrollContainerRef.value) return;

  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading.value) {
      if (totalItems.value === 0 || libraryItems.value.length < totalItems.value) {
        fetchMoreItems();
      }
    }
  }, { 
    threshold: 0, // Immediate trigger
    rootMargin: '400px', // Balanced margin for stability
    root: scrollContainerRef.value 
  });
  
  if (sentinelRef.value) {
    observer.observe(sentinelRef.value);
  }
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

// Re-setup observer on search or sort change to ensure it doesn't get "stuck"
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

      <!-- Sentinel - Sibling to grid, within scroll container -->
      <div ref="sentinelRef" class="h-64 w-full flex items-center justify-center mt-12 mb-20">
        <div v-if="isLoading" class="flex flex-col items-center gap-4">
          <Loader2 class="animate-spin text-purple-500" :size="32" />
          <p class="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-700">Deciphering Archive Index...</p>
        </div>
        <span v-else-if="libraryItems.length >= totalItems && totalItems > 0" class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-800">
          INDEX REACHED END
        </span>
      </div>
    </div>
  </div>
</template>