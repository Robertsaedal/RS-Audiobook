<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
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
const currentPage = ref(0);
const isLoading = ref(false);
const sentinelRef = ref<HTMLElement | null>(null);

const ITEMS_PER_FETCH = 48;

// Local search filtering for instant results as requested
const filteredBooks = computed(() => {
  if (!props.search) return libraryItems.value;
  const term = props.search.toLowerCase();
  return libraryItems.value.filter(item => 
    item.media.metadata.title.toLowerCase().includes(term) || 
    item.media.metadata.authorName.toLowerCase().includes(term)
  );
});

const fetchItems = async (isInitial = false) => {
  if (isLoading.value) return;
  
  // Safety check: if we've loaded everything, stop.
  if (!isInitial && totalItems.value > 0 && libraryItems.value.length >= totalItems.value) return;

  isLoading.value = true;
  try {
    // 1. Calculate offset and increment page BEFORE fetch to prevent race condition loops
    const offset = currentPage.value * ITEMS_PER_FETCH;
    
    const params: LibraryQueryParams = {
      limit: ITEMS_PER_FETCH,
      offset: offset,
      sort: props.sortMethod,
      desc: props.desc
    };
    
    const { results, total } = await props.absService.getLibraryItemsPaged(params);
    
    if (isInitial) {
      libraryItems.value = results;
      currentPage.value = 1; // Set to next page
    } else {
      // 2. Prevent Duplicates: Check if ID already exists before pushing
      const existingIds = new Set(libraryItems.value.map(i => i.id));
      const uniqueResults = results.filter(i => !existingIds.has(i.id));
      
      if (uniqueResults.length > 0) {
        libraryItems.value = [...libraryItems.value, ...uniqueResults];
        currentPage.value++; // Successfully loaded a page, increment pointer
      }
    }
    totalItems.value = total;
  } catch (e) {
    console.error("Failed to fetch library items", e);
  } finally {
    isLoading.value = false;
  }
};

const reset = async () => {
  libraryItems.value = [];
  totalItems.value = 0;
  currentPage.value = 0;
  await fetchItems(true);
};

let observer: IntersectionObserver | null = null;
const setupObserver = () => {
  if (observer) observer.disconnect();
  
  // Fix IntersectionObserver: rootMargin helps trigger earlier for smoother experience
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading.value) {
      // Only fetch if there are actually more items to get
      if (totalItems.value === 0 || libraryItems.value.length < totalItems.value) {
        fetchItems();
      }
    }
  }, { threshold: 0.1, rootMargin: '400px' });
  
  if (sentinelRef.value) observer.observe(sentinelRef.value);
};

onMounted(async () => {
  await reset();
  setupObserver();

  // Socket Sync: Listen for progress updates locally
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

// Reset logic when sorting or direction changes
watch(() => [props.sortMethod, props.desc], () => reset());
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-40">
      <div v-if="filteredBooks.length === 0 && !isLoading" class="flex flex-col items-center justify-center py-40 text-center opacity-40">
        <PackageOpen :size="64" class="text-neutral-800 mb-6" />
        <h3 class="text-xl font-black uppercase tracking-tighter">No artifacts found</h3>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-12">
        <BookCard 
          v-for="item in filteredBooks" 
          :key="item.id"
          :item="item"
          :coverUrl="absService.getCoverUrl(item.id)"
          show-metadata
          @click="emit('select-item', item)"
        />
      </div>

      <!-- Scroll Sentinel -->
      <div ref="sentinelRef" class="w-full h-32 flex items-center justify-center mt-8">
        <Loader2 v-if="isLoading" class="animate-spin text-purple-500" :size="32" />
        <span v-else-if="libraryItems.length >= totalItems && totalItems > 0" class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-800">
          INDEX REACHED END
        </span>
      </div>
    </div>
  </div>
</template>