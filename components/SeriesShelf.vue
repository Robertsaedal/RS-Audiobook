<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { ABSSeries } from '../types';
import { ABSService, LibraryQueryParams } from '../services/absService';
import SeriesCard from './SeriesCard.vue';
import { PackageOpen, Loader2 } from 'lucide-vue-next';

const props = defineProps<{
  absService: ABSService,
  isStreaming?: boolean,
  sortMethod: string,
  desc: number
}>();

const emit = defineEmits<{
  (e: 'select-series', series: ABSSeries): void
}>();

const seriesItems = ref<ABSSeries[]>([]);
const totalSeries = ref(0);
const offset = ref(0);
const isLoading = ref(false);
const scrollContainerRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);

const ITEMS_PER_FETCH = 20;

const fetchMoreSeries = async (isInitial = false) => {
  if (isLoading.value) return;
  if (!isInitial && totalSeries.value > 0 && seriesItems.value.length >= totalSeries.value) return;

  isLoading.value = true;
  try {
    const fetchOffset = isInitial ? 0 : offset.value;
    const params: LibraryQueryParams = {
      limit: ITEMS_PER_FETCH,
      offset: fetchOffset,
      sort: props.sortMethod,
      desc: props.desc
    };
    
    const { results, total } = await props.absService.getLibrarySeriesPaged(params);
    
    if (isInitial) {
      seriesItems.value = results;
      offset.value = results.length;
    } else {
      const existingIds = new Set(seriesItems.value.map(s => s.id));
      const uniqueResults = results.filter(s => !existingIds.has(s.id));
      
      if (uniqueResults.length > 0) {
        seriesItems.value.push(...uniqueResults);
      }
      offset.value += ITEMS_PER_FETCH;
    }
    totalSeries.value = total;
  } catch (e) {
    console.error("Failed to fetch series items", e);
  } finally {
    isLoading.value = false;
  }
};

const reset = async () => {
  offset.value = 0;
  seriesItems.value = [];
  totalSeries.value = 0;
  if (scrollContainerRef.value) scrollContainerRef.value.scrollTop = 0;
  await fetchMoreSeries(true);
};

let observer: IntersectionObserver | null = null;
const setupObserver = () => {
  if (observer) observer.disconnect();
  
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading.value) {
      if (totalSeries.value === 0 || seriesItems.value.length < totalSeries.value) {
        fetchMoreSeries();
      }
    }
  }, { 
    threshold: 0.1, 
    rootMargin: '400px',
    root: scrollContainerRef.value
  });
  
  if (sentinelRef.value) observer.observe(sentinelRef.value);
};

onMounted(async () => {
  await reset();
  setupObserver();
  props.absService.onLibraryUpdate(() => reset());
});

onUnmounted(() => {
  observer?.disconnect();
});

watch(() => [props.sortMethod, props.desc], () => reset());
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
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

      <div id="series-scroll-sentinel" ref="sentinelRef" class="h-32 w-full flex items-center justify-center mt-12 mb-20">
        <div v-if="isLoading" class="flex flex-col items-center gap-4">
          <Loader2 class="animate-spin text-purple-500" :size="32" />
          <p class="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-700">Categorizing Artifact Stacks...</p>
        </div>
        <span v-else-if="seriesItems.length >= totalSeries && totalSeries > 0" class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-800">
          ARCHIVE END REACHED
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
</style>