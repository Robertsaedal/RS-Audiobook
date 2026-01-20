<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { ABSService, LibraryQueryParams } from '../services/absService';
import BookCard from './BookCard.vue';
import { PackageOpen, Activity, Loader2 } from 'lucide-vue-next';

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

// Data State
const libraryItems = ref<ABSLibraryItem[]>([]);
const totalItems = ref(0);
const currentPage = ref(0);
const isLoading = ref(false);
const sentinelRef = ref<HTMLElement | null>(null);

const ITEMS_PER_FETCH = 48;

// Local search filtering as requested
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
  if (!isInitial && libraryItems.value.length >= totalItems.value && totalItems.value > 0) return;

  isLoading.value = true;
  try {
    const params: LibraryQueryParams = {
      limit: ITEMS_PER_FETCH,
      offset: currentPage.value * ITEMS_PER_FETCH,
      sort: props.sortMethod,
      desc: props.desc
      // Note: We don't use API search here to support the "Local Computed Filter" requirement
    };
    
    const { results, total } = await props.absService.getLibraryItemsPaged(params);
    
    if (isInitial) {
      libraryItems.value = results;
    } else {
      // Append results to current array
      libraryItems.value = [...libraryItems.value, ...results];
    }
    totalItems.value = total;
    currentPage.value++;
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

// Intersection Observer for Infinite Scroll
let observer: IntersectionObserver | null = null;
const setupObserver = () => {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading.value) {
      fetchItems();
    }
  }, { threshold: 0.1 });
  
  if (sentinelRef.value) observer.observe(sentinelRef.value);
};

onMounted(async () => {
  await reset();
  setupObserver();

  // Socket sync for this shelf
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

watch(() => [props.sortMethod, props.desc], () => reset());

// If search changes significantly, we might want to ensure we have enough results,
// but for "Local Computed Filter" we just filter what we've loaded so far.
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Bookshelf Grid -->
    <div class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-32">
      <div v-if="filteredBooks.length === 0 && !isLoading" class="flex flex-col items-center justify-center py-40 text-center opacity-40">
        <PackageOpen :size="64" class="text-neutral-800 mb-6" />
        <h3 class="text-xl font-black uppercase tracking-tighter">Repository Empty</h3>
        <p class="text-[9px] font-black uppercase tracking-widest mt-2">No matching artifacts in local index</p>
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

      <!-- Infinite Scroll Sentinel -->
      <div ref="sentinelRef" class="w-full h-24 flex items-center justify-center mt-12">
        <Loader2 v-if="isLoading" class="animate-spin text-purple-500" :size="32" />
        <span v-else-if="libraryItems.length >= totalItems && totalItems > 0" class="text-[8px] font-black uppercase tracking-[0.5em] text-neutral-800">
          END OF REGISTRY
        </span>
      </div>
    </div>
  </div>
</template>