<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { ABSService, LibraryQueryParams } from '../services/absService';
import BookCard from './BookCard.vue';
import { PackageOpen, Loader2, Plus, AlertTriangle, FastForward } from 'lucide-vue-next';

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
const internalOffset = ref(0);
const isLoading = ref(false);
const hasMore = ref(true);
const duplicateWallDetected = ref(false);
const scrollContainerRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);

// Chunking Guard: Prevents duplicate requests for the same segment
const requestedOffsets = new Set<number>();

const ITEMS_PER_FETCH = 60;

/**
 * Normalizes sort keys to match ABSService's strict mapping.
 */
const getMappedSortKey = (method: string) => {
  const m = method.toLowerCase();
  if (m === 'added' || m === 'addedat') return 'addedAt';
  if (m === 'updated' || m === 'updatedat') return 'updatedAt';
  if (m === 'title' || m.includes('metadata.title')) return 'media.metadata.title';
  if (m === 'author' || m.includes('metadata.author')) return 'media.metadata.authorName';
  return method || 'addedAt';
};

/**
 * Core fetch function with explicit offset guards.
 */
const fetchMoreItems = async (isInitial = false) => {
  const fetchOffset = isInitial ? 0 : internalOffset.value;
  
  // Guard: Don't request if already loading, already finished, or already requested this chunk
  if (isLoading.value) return;
  if (!isInitial && !hasMore.value) return;
  if (requestedOffsets.has(fetchOffset) && !isInitial) return;

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
    
    console.log(`📡 [Bookshelf] Query: Offset ${params.offset}, Sort ${params.sort}`);

    const response = await props.absService.getLibraryItemsPaged(params);
    const results = response?.results || [];
    const total = response?.total || 0;
    
    totalItems.value = total;

    if (results.length === 0) {
      console.log("⏹️ [Bookshelf] Terminus reached (Empty response).");
      hasMore.value = false;
      return;
    }

    // Official Behavior: Always increment offset by requested limit to avoid loops
    internalOffset.value = fetchOffset + ITEMS_PER_FETCH;

    if (isInitial) {
      libraryItems.value = results;
    } else {
      // Deduplicate by ID as timestamps can be identical (migration artifacts)
      const existingIds = new Set(libraryItems.value.map(i => i.id));
      const uniqueResults = results.filter(i => !existingIds.has(i.id));
      
      if (uniqueResults.length > 0) {
        libraryItems.value.push(...uniqueResults);
      } else {
        console.warn("⚠️ [Bookshelf] Shifted content detected (All duplicates).");
        duplicateWallDetected.value = true;
      }
    }
    
    if (internalOffset.value >= totalItems.value) {
      hasMore.value = false;
    }

    // Auto-fill viewport logic
    await nextTick();
    const sentinel = sentinelRef.value;
    if (sentinel && hasMore.value && !isLoading.value && !duplicateWallDetected.value) {
      const rect = sentinel.getBoundingClientRect();
      if (rect.top < window.innerHeight + 800) {
        setTimeout(() => fetchMoreItems(false), 50);
      }
    }
  } catch (e) {
    console.error("❌ [Bookshelf] Fetch error:", e);
    hasMore.value = false; 
  } finally {
    isLoading.value = false;
  }
};

let observer: IntersectionObserver | null = null;
const setupObserver = () => {
  if (observer) observer.disconnect();
  if (!sentinelRef.value) return;

  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading.value && hasMore.value) {
      fetchMoreItems();
    }
  }, { 
    threshold: 0,
    rootMargin: '800px',
    root: null 
  });
  
  observer.observe(sentinelRef.value);
};

const reset = async () => {
  if (observer) observer.disconnect();
  console.log("♻️ [Bookshelf] Resetting index...");
  
  requestedOffsets.clear();
  isLoading.value = false;
  hasMore.value = true;
  duplicateWallDetected.value = false;
  totalItems.value = 0;
  internalOffset.value = 0;
  libraryItems.value = [];
  
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = 0;
  }
  
  await nextTick();
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

watch(() => [props.sortMethod, props.desc, props.search], () => reset(), { deep: true });
</script>

<template>
  <div class="flex-1 h-full min-h-0 flex flex-col overflow-hidden">
    <div ref="scrollContainerRef" class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-40 relative">
      
      <div v-if="libraryItems.length === 0 && !isLoading" class="flex flex-col items-center justify-center py-40 text-center opacity-40">
        <PackageOpen :size="64" class="text-neutral-800 mb-6" />
        <h3 class="text-xl font-black uppercase tracking-tighter">Archive Empty</h3>
        <p class="text-[9px] font-black uppercase tracking-widest mt-2">No records in current frequency</p>
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

      <div ref="sentinelRef" class="h-24 w-full flex flex-col items-center justify-center mt-12 mb-24 gap-6">
        <div v-if="isLoading" class="flex flex-col items-center gap-4">
          <div class="w-8 h-8 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
          <p class="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-700">Accessing Index...</p>
        </div>
        
        <div v-else-if="duplicateWallDetected && hasMore" class="flex flex-col items-center gap-4">
           <div class="flex items-center gap-3 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500">
             <AlertTriangle :size="14" />
             <span class="text-[9px] font-black uppercase tracking-widest">Index Wall Reached</span>
           </div>
           <button 
            @click="fetchMoreItems()"
            class="flex items-center gap-3 px-6 py-3 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-[0.4em] text-neutral-400 hover:text-purple-400 hover:border-purple-500/20 transition-all active:scale-95"
           >
            <FastForward :size="14" />
            <span>Force Jump Next Segment</span>
          </button>
        </div>

        <button 
          v-else-if="!isLoading && hasMore && totalItems > 0"
          @click="fetchMoreItems()"
          class="flex items-center gap-3 px-6 py-3 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-[0.4em] text-neutral-500 hover:text-purple-400 hover:border-purple-500/20 transition-all active:scale-95"
        >
          <Plus :size="14" />
          <span>Sync More</span>
        </button>

        <span v-else-if="!isLoading && !hasMore && libraryItems.length > 0" class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-800/20">
          INDEX TERMINUS REACHED ({{ libraryItems.length }} OF {{ totalItems }})
        </span>
      </div>
    </div>
  </div>
</template>