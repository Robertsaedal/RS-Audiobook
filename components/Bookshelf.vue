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

const fetchMoreItems = async (isInitial = false) => {
  if (isLoading.value) return;
  // If not initial, check if we've reached the end
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
      offset.value = results.length;
    } else {
      const existingIds = new Set(libraryItems.value.map(i => i.id));
      const uniqueResults = results.filter(i => !existingIds.has(i.id));
      
      if (uniqueResults.length > 0) {
        libraryItems.value.push(...uniqueResults);
        offset.value += results.length;
      } else if (results.length > 0) {
        // If we got results but they weren't unique, we still need to increment offset 
        // to eventually move past them if sorting is unstable
        offset.value += results.length;
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
  
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading.value) {
      if (totalItems.value === 0 || libraryItems.value.length < totalItems.value) {
        fetchMoreItems();
      }
    }
  }, { threshold: 0.1, rootMargin: '600px' });
  
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
    <div class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-40 relative">
      <div v-if="libraryItems.length === 0 && !isLoading" class="flex flex-col items-center justify-center py-40 text-center opacity-40">
        <PackageOpen :size="64" class="text-neutral-800 mb-6" />
        <h3 class="text-xl font-black uppercase tracking-tighter">No artifacts found</h3>
      </div>

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

      <div id="scroll-sentinel" ref="sentinelRef" class="h-32 w-full flex items-center justify-center mt-12 mb-20">
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