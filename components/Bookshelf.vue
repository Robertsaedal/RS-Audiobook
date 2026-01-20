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

const ITEMS_PER_FETCH = 60;

/**
 * Maps human-readable sort keys to Audiobookshelf API expectations.
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
 * Core fetch function with dynamic offset and duplicate bypass logic.
 */
const fetchMoreItems = async (isInitial = false) => {
  if (isLoading.value) return;
  if (!isInitial && !hasMore.value) return;

  isLoading.value = true;
  duplicateWallDetected.value = false;

  try {
    const sortKey = getMappedSortKey(props.sortMethod);
    
    const params: LibraryQueryParams = {
      limit: ITEMS_PER_FETCH,
      offset: internalOffset.value,
      sort: sortKey,
      desc: props.desc,
      search: props.search
    };
    
    console.log(`📡 [Bookshelf] Requesting Index: Offset ${params.offset}, Sort ${params.sort}, Desc ${params.desc}`);

    const response = await props.absService.getLibraryItemsPaged(params);
    const results = response?.results || [];
    const total = response?.total || 0;
    totalItems.value = total;

    // 1. Handle Empty Response
    if (results.length === 0) {
      console.log("⏹️ [Bookshelf] Archive returned empty set. Terminating stream.");
      hasMore.value = false;
      return;
    }

    // 2. Increment Offset Immediately (Force progress even if shifted)
    internalOffset.value += results.length;

    if (isInitial) {
      libraryItems.value = results;
    } else {
      // 3. Unique Filtering
      const existingIds = new Set(libraryItems.value.map(i => i.id));
      const uniqueResults = results.filter(i => !existingIds.has(i.id));
      
      if (uniqueResults.length > 0) {
        libraryItems.value.push(...uniqueResults);
        console.log(`✅ [Bookshelf] Added ${uniqueResults.length} new unique items.`);
      } else {
        // 4. Force Jump Logic (List Shifting Mitigation)
        console.warn("⚠️ [Bookshelf] Batch contained only duplicates. Jumping offset to skip shifted content.");
        duplicateWallDetected.value = true;
        // We don't set hasMore = false here because we want to allow 
        // the next fetch (with the newly incremented offset) to attempt recovery.
      }
    }
    
    // Check if we've theoretically reached the end
    if (internalOffset.value >= total) {
      console.log("🏁 [Bookshelf] Index terminus reached.");
      hasMore.value = false;
    }

    // 5. Recursive Fill Check (Strictly Guarded)
    await nextTick();
    const sentinel = sentinelRef.value;
    if (sentinel && hasMore.value && !isLoading.value && !duplicateWallDetected.value) {
      const rect = sentinel.getBoundingClientRect();
      if (rect.top < window.innerHeight + 400) {
        // Use timeout to yield to UI thread
        setTimeout(() => fetchMoreItems(false), 100);
      }
    }
  } catch (e) {
    console.error("❌ [Bookshelf] Portal Connection Failed:", e);
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
    // Only trigger if intersecting AND not already processing
    if (entries[0].isIntersecting && !isLoading.value && hasMore.value) {
      fetchMoreItems();
    }
  }, { 
    threshold: 0,
    rootMargin: '400px',
    root: null 
  });
  
  observer.observe(sentinelRef.value);
};

const reset = async () => {
  if (observer) observer.disconnect();
  
  console.log("♻️ [Bookshelf] Resetting archive index...");
  
  isLoading.value = false;
  hasMore.value = true;
  duplicateWallDetected.value = false;
  totalItems.value = 0;
  internalOffset.value = 0;
  libraryItems.value = [];
  
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = 0;
  }
  
  // Wait for clear then fetch initial
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

// Watch for sorting/searching changes to reset the stream
watch(() => [props.sortMethod, props.desc, props.search], () => reset(), { deep: true });
</script>

<template>
  <div class="flex-1 h-full min-h-0 flex flex-col overflow-hidden">
    <div ref="scrollContainerRef" class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-40 relative">
      
      <!-- Empty State -->
      <div v-if="libraryItems.length === 0 && !isLoading" class="flex flex-col items-center justify-center py-40 text-center opacity-40">
        <PackageOpen :size="64" class="text-neutral-800 mb-6" />
        <h3 class="text-xl font-black uppercase tracking-tighter">Archive Empty</h3>
        <p class="text-[9px] font-black uppercase tracking-widest mt-2">No records detected in current sector</p>
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
        
        <!-- Loading State -->
        <div v-if="isLoading" class="flex flex-col items-center gap-4">
          <div class="w-8 h-8 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
          <p class="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-700">Accessing Index...</p>
        </div>
        
        <!-- Wall Detected State (Allow Manual Jump) -->
        <div v-else-if="duplicateWallDetected" class="flex flex-col items-center gap-4">
           <div class="flex items-center gap-3 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500">
             <AlertTriangle :size="14" />
             <span class="text-[9px] font-black uppercase tracking-widest">Index Shift Detected</span>
           </div>
           <button 
            @click="fetchMoreItems()"
            class="flex items-center gap-3 px-6 py-3 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-[0.4em] text-neutral-400 hover:text-purple-400 hover:border-purple-500/20 transition-all active:scale-95"
           >
            <FastForward :size="14" />
            <span>Jump to Next Page</span>
          </button>
        </div>

        <!-- Manual Fetch Trigger -->
        <button 
          v-else-if="!isLoading && hasMore && totalItems > 0"
          @click="fetchMoreItems()"
          class="flex items-center gap-3 px-6 py-3 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-[0.4em] text-neutral-500 hover:text-purple-400 hover:border-purple-500/20 transition-all active:scale-95"
        >
          <Plus :size="14" />
          <span>Sync More</span>
        </button>

        <!-- Terminus -->
        <span v-else-if="!isLoading && !hasMore && libraryItems.length > 0" class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-800/20">
          INDEX TERMINUS REACHED
        </span>
      </div>
    </div>
  </div>
</template>