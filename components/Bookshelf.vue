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
const offset = ref(0);
const isLoading = ref(false);
const sentinelRef = ref<HTMLElement | null>(null);

const ITEMS_PER_FETCH = 20;

const filteredBooks = computed(() => {
  // If search is truthy, we assume libraryItems already contains server-side search results
  if (props.search) return libraryItems.value;
  
  // Local filtering logic: If search is empty, we could apply local filters here
  // For now, we return the items as-is since they are paginated
  return libraryItems.value;
});

const fetchMoreItems = async (isInitial = false) => {
  if (isLoading.value) return;
  if (!isInitial && totalItems.value > 0 && libraryItems.value.length >= totalItems.value) return;

  isLoading.value = true;
  try {
    const params: LibraryQueryParams = {
      limit: ITEMS_PER_FETCH,
      offset: isInitial ? 0 : offset.value,
      sort: props.sortMethod,
      desc: props.desc,
      search: props.search
    };
    
    const { results, total } = await props.absService.getLibraryItemsPaged(params);
    
    if (isInitial) {
      libraryItems.value = results;
      offset.value = ITEMS_PER_FETCH;
    } else {
      // Logic: Use items.value.push(...newItems) to add them to the screen
      const existingIds = new Set(libraryItems.value.map(i => i.id));
      const uniqueResults = results.filter(i => !existingIds.has(i.id));
      
      if (uniqueResults.length > 0) {
        libraryItems.value.push(...uniqueResults);
        // Increment offset by 20
        offset.value += ITEMS_PER_FETCH;
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
  offset.value = 0;
  libraryItems.value = [];
  totalItems.value = 0;
  await fetchMoreItems(true);
};

let observer: IntersectionObserver | null = null;
const setupObserver = () => {
  if (observer) observer.disconnect();
  
  // IntersectionObserver to watch #scroll-sentinel
  observer = new IntersectionObserver((entries) => {
    // When the sentinel enters the viewport
    if (entries[0].isIntersecting && !isLoading.value) {
      if (totalItems.value === 0 || libraryItems.value.length < totalItems.value) {
        // Call fetchMoreItems()
        fetchMoreItems();
      }
    }
  }, { threshold: 0.1, rootMargin: '400px' });
  
  if (sentinelRef.value) observer.observe(sentinelRef.value);
};

onMounted(async () => {
  await reset();
  setupObserver();

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

watch(() => [props.sortMethod, props.desc, props.search], () => reset());
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

      <!-- Sentinel element for infinite scrolling -->
      <div id="scroll-sentinel" ref="sentinelRef" class="h-10 w-full flex items-center justify-center mt-8">
        <Loader2 v-if="isLoading" class="animate-spin text-purple-500" :size="24" />
        <span v-else-if="libraryItems.length >= totalItems && totalItems > 0" class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-800">
          INDEX REACHED END
        </span>
      </div>
    </div>
  </div>
</template>