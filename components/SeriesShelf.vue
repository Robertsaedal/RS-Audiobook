<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { ABSSeries } from '../types';
import { ABSService, LibraryQueryParams } from '../services/absService';
import SeriesCard from './SeriesCard.vue';
import { PackageOpen, Loader2, AlertTriangle, RotateCw, FastForward, Plus } from 'lucide-vue-next';

const props = defineProps<{
  absService: ABSService,
  isStreaming?: boolean,
  sortMethod: string,
  desc: number,
  search?: string
}>();

const emit = defineEmits<{
  (e: 'select-series', series: ABSSeries): void
}>();

const seriesItems = ref<ABSSeries[]>([]);
const totalSeries = ref(0);
const internalOffset = ref(0);
const isLoading = ref(false);
const hasMore = ref(true);
const duplicateWallDetected = ref(false);
const scrollContainerRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);

// Chunking Guard: Prevents duplicate requests for the same segment
const requestedOffsets = new Set<number>();

const ITEMS_PER_FETCH = 20;

/**
 * Core fetch function with explicit offset guards and duplicate detection.
 */
const fetchMoreSeries = async (isInitial = false) => {
  const fetchOffset = isInitial ? 0 : internalOffset.value;
  
  // Guard: Don't request if already loading, already finished, or already requested this chunk
  if (isLoading.value) return;
  if (!isInitial && !hasMore.value) return;
  if (requestedOffsets.has(fetchOffset) && !isInitial) return;

  isLoading.value = true;
  duplicateWallDetected.value = false;
  requestedOffsets.add(fetchOffset);

  try {
    const params: LibraryQueryParams = {
      limit: ITEMS_PER_FETCH,
      offset: fetchOffset,
      sort: props.sortMethod,
      desc: props.desc,
      search: props.search
    };
    
    console.log(`📡 [SeriesShelf] Querying Page: Offset ${params.offset}, Sort ${params.sort}`);

    const response = await props.absService.getLibrarySeriesPaged(params);
    const results = response?.results || [];
    const total = response?.total || 0;
    
    totalSeries.value = total;

    if (results.length === 0) {
      console.log("⏹️ [SeriesShelf] No series returned. Stream complete.");
      hasMore.value = false;
      return;
    }

    // Increment offset by requested limit to bypass caching loops
    internalOffset.value = fetchOffset + ITEMS_PER_FETCH;

    if (isInitial) {
      seriesItems.value = results;
    } else {
      // Deduplicate strictly by ID
      const existingIds = new Set(seriesItems.value.map(s => s.id));
      const uniqueResults = results.filter(s => !existingIds.has(s.id));
      
      if (uniqueResults.length > 0) {
        seriesItems.value.push(...uniqueResults);
        console.log(`✅ [SeriesShelf] Integrated ${uniqueResults.length} new stacks.`);
      } else {
        console.warn("⚠️ [SeriesShelf] Pagination loop detected. Server returned only existing records for this offset.");
        duplicateWallDetected.value = true;
        // Keep hasMore = true so the user can use "Jump" to bypass the cache.
      }
    }
    
    // Check if we've theoretically hit the end. 
    // CRITICAL FIX: Only set hasMore = false if we've actually loaded enough unique items
    // OR if the offset has truly exceeded the total and we aren't in a duplicate loop.
    const reachedTerminus = seriesItems.value.length >= totalSeries.value || 
                          (internalOffset.value >= totalSeries.value && !duplicateWallDetected.value);
                          
    if (reachedTerminus) {
      console.log(`🏁 [SeriesShelf] Reached terminus: ${seriesItems.value.length} of ${totalSeries.value}`);
      hasMore.value = false;
    }

    // Auto-fill viewport if we haven't hit a wall
    await nextTick();
    const sentinel = sentinelRef.value;
    if (sentinel && hasMore.value && !isLoading.value && !duplicateWallDetected.value) {
      const rect = sentinel.getBoundingClientRect();
      if (rect.top < window.innerHeight + 1000) {
        setTimeout(() => fetchMoreSeries(false), 100);
      }
    }
  } catch (e) {
    console.error("❌ [SeriesShelf] Nexus transmission failure:", e);
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
      fetchMoreSeries();
    }
  }, { 
    threshold: 0, 
    rootMargin: '1000px',
    root: null
  });
  
  observer.observe(sentinelRef.value);
};

const reset = async () => {
  if (observer) observer.disconnect();
  console.log("♻️ [SeriesShelf] Resetting index...");
  
  requestedOffsets.clear();
  isLoading.value = false;
  hasMore.value = true;
  duplicateWallDetected.value = false;
  totalSeries.value = 0;
  internalOffset.value = 0;
  seriesItems.value = [];
  
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = 0;
  }
  
  await nextTick();
  await fetchMoreSeries(true);
  await nextTick();
  setupObserver();
};

onMounted(async () => {
  await reset();
  props.absService.onLibraryUpdate(() => reset());
});

onUnmounted(() => {
  observer?.disconnect();
});

watch(() => [props.sortMethod, props.desc, props.search], () => reset());
</script>

<template>
  <div class="flex-1 h-full flex flex-col overflow-hidden">
    <div ref="scrollContainerRef" class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-40 relative">
      
      <div v-if="seriesItems.length === 0 && !isLoading" class="flex flex-col items-center justify-center py-40 text-center opacity-40">
        <PackageOpen :size="64" class="text-neutral-800 mb-6" />
        <h3 class="text-xl font-black uppercase tracking-tighter">No Stacks Established</h3>
        <p class="text-[9px] font-black uppercase tracking-widest mt-2">Archives are not categorized by series</p>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-12 gap-y-16 px-4">
        <SeriesCard 
          v-for="series in seriesItems" 
          :key="series.id"
          :series="series"
          :coverUrl="absService.getCoverUrl(series.books?.[0]?.id || '')"
          :bookCovers="series.books?.slice(0, 3).map(b => absService.getCoverUrl(b.id)) || []"
          @click="emit('select-series', series)"
          class="animate-fade-in"
        />
      </div>

      <div ref="sentinelRef" class="h-40 w-full flex flex-col items-center justify-center mt-12 mb-20 gap-6">
        <div v-if="isLoading" class="flex flex-col items-center gap-4">
          <Loader2 class="animate-spin text-purple-500" :size="32" />
          <p class="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-700">Categorizing Artifact Stacks...</p>
        </div>

        <div v-else-if="duplicateWallDetected && hasMore" class="flex flex-col items-center gap-4 animate-fade-in">
           <div class="flex items-center gap-3 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500">
             <AlertTriangle :size="14" />
             <span class="text-[9px] font-black uppercase tracking-widest">Cache Wall Detected</span>
           </div>
           <div class="flex items-center gap-4">
              <button 
                @click="reset()"
                class="flex items-center gap-3 px-6 py-3 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-[0.4em] text-neutral-400 hover:text-purple-400 hover:border-purple-500/20 transition-all active:scale-95"
              >
                <RotateCw :size="14" />
                <span>Force Re-Sync</span>
              </button>
              <button 
                @click="fetchMoreSeries()"
                class="flex items-center gap-3 px-6 py-3 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-[0.4em] text-neutral-400 hover:text-purple-400 hover:border-purple-500/20 transition-all active:scale-95"
              >
                <FastForward :size="14" />
                <span>Jump Segment</span>
              </button>
           </div>
           <p class="text-[8px] font-black text-neutral-700 uppercase tracking-widest text-center max-w-xs">
             The server returned duplicates for this series segment. Using Re-Sync or Jump can bypass stale API caches.
           </p>
        </div>

        <button 
          v-else-if="!isLoading && hasMore && totalSeries > 0"
          @click="fetchMoreSeries()"
          class="flex items-center gap-3 px-6 py-3 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-[0.4em] text-neutral-500 hover:text-purple-400 hover:border-purple-500/20 transition-all active:scale-95"
        >
          <Plus :size="14" />
          <span>Load More Series</span>
        </button>

        <span v-else-if="!isLoading && !hasMore && seriesItems.length > 0" class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-800/20">
          ARCHIVE END REACHED ({{ seriesItems.length }} OF {{ totalSeries }})
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fade-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes fade-in {
  from { opacity: 0; transform: scale(0.9) translateY(15px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(168, 85, 247, 0.1);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(168, 85, 247, 0.3);
}
</style>