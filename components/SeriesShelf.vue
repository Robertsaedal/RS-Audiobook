
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, reactive, nextTick } from 'vue';
import { ABSSeries } from '../types';
import { ABSService, LibraryQueryParams } from '../services/absService';
import SeriesCard from './SeriesCard.vue';
import { PackageOpen, Activity } from 'lucide-vue-next';

const props = defineProps<{
  absService: ABSService,
  isStreaming?: boolean,
  sortMethod: string,
  desc: number
}>();

const emit = defineEmits<{
  (e: 'select-series', series: ABSSeries): void
}>();

const shelfRef = ref<HTMLElement | null>(null);
const containerWidth = ref(0);
const containerHeight = ref(0);
const scrollTop = ref(0);

const entities = ref<(ABSSeries | null)[]>([]);
const totalEntities = ref(0);
const loadingPages = new Set<number>();

const CARD_ASPECT_RATIO = 1.5;
const MIN_CARD_WIDTH = 160;
const CARD_GUTTER = 40;
const SHELF_PADDING_Y = 60;
const ITEMS_PER_FETCH = 24;

const layout = reactive({
  cardWidth: 0,
  cardHeight: 0,
  entitiesPerRow: 0,
  totalRows: 0,
  shelfHeight: 0,
  marginLeft: 0
});

const calculateLayout = async () => {
  await nextTick();
  if (!shelfRef.value) return;
  const width = shelfRef.value.clientWidth;
  const height = shelfRef.value.clientHeight;
  
  if (width === 0) return;

  containerWidth.value = width;
  containerHeight.value = height;

  const availableWidth = width - 64; 
  layout.entitiesPerRow = Math.max(2, Math.floor(availableWidth / (MIN_CARD_WIDTH + CARD_GUTTER)));
  layout.cardWidth = Math.floor((availableWidth - (layout.entitiesPerRow - 1) * CARD_GUTTER) / layout.entitiesPerRow);
  layout.cardHeight = layout.cardWidth * CARD_ASPECT_RATIO;
  layout.shelfHeight = layout.cardHeight + SHELF_PADDING_Y;
  layout.totalRows = Math.ceil(totalEntities.value / Math.max(1, layout.entitiesPerRow));
  layout.marginLeft = (width - (layout.entitiesPerRow * layout.cardWidth + (layout.entitiesPerRow - 1) * CARD_GUTTER)) / 2;
};

const visibleRange = computed(() => {
  if (totalEntities.value === 0 || layout.shelfHeight === 0) return { start: 0, end: 0 };
  const startRow = Math.max(0, Math.floor(scrollTop.value / layout.shelfHeight) - 1);
  const endRow = Math.ceil((scrollTop.value + containerHeight.value) / layout.shelfHeight) + 1;
  return {
    start: startRow * layout.entitiesPerRow,
    end: Math.min(totalEntities.value, (endRow + 1) * layout.entitiesPerRow)
  };
});

const visibleEntities = computed(() => {
  const { start, end } = visibleRange.value;
  const result = [];
  for (let i = start; i < end; i++) {
    result.push({
      index: i,
      data: entities.value[i] || null,
      x: layout.marginLeft + (i % layout.entitiesPerRow) * (layout.cardWidth + CARD_GUTTER),
      y: Math.floor(i / layout.entitiesPerRow) * layout.shelfHeight
    });
  }
  return result;
});

const fetchPage = async (page: number) => {
  if (loadingPages.has(page)) return;
  loadingPages.add(page);

  try {
    const params: LibraryQueryParams = {
      limit: ITEMS_PER_FETCH,
      offset: page * ITEMS_PER_FETCH,
      sort: props.sortMethod === 'addedAt' ? 'addedDate' : props.sortMethod,
      desc: props.desc
    };
    
    const { results, total } = await props.absService.getLibrarySeriesPaged(params);
    
    const rawTotal = typeof total === 'number' ? total : parseInt(total as any) || 0;
    const validTotal = Math.max(0, Math.min(Math.floor(rawTotal), 50000));
    
    if (totalEntities.value !== validTotal) {
      totalEntities.value = validTotal;
      if (entities.value.length !== validTotal) {
        entities.value = new Array(validTotal).fill(null);
      }
      await calculateLayout();
    }

    if (results && Array.isArray(results)) {
      results.forEach((item, idx) => {
        const targetIdx = (page * ITEMS_PER_FETCH) + idx;
        if (targetIdx < entities.value.length) {
          entities.value[targetIdx] = item;
        }
      });
    }
  } catch (e) {
    console.error("Failed to fetch series shelf page", e);
  } finally {
    loadingPages.delete(page);
  }
};

const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement;
  scrollTop.value = target.scrollTop;
  
  const { start, end } = visibleRange.value;
  const startPage = Math.floor(start / ITEMS_PER_FETCH);
  const endPage = Math.floor(end / ITEMS_PER_FETCH);

  for (let p = startPage; p <= endPage; p++) {
    const startIdx = p * ITEMS_PER_FETCH;
    if (startIdx < totalEntities.value && !entities.value[startIdx]) {
      fetchPage(p);
    }
  }
};

const reset = async () => {
  entities.value = [];
  totalEntities.value = 0;
  scrollTop.value = 0;
  if (shelfRef.value) shelfRef.value.scrollTop = 0;
  await fetchPage(0);
  await calculateLayout();
};

let resizeObserver: ResizeObserver | null = null;
onMounted(async () => {
  await reset();
  resizeObserver = new ResizeObserver(() => calculateLayout());
  if (shelfRef.value) resizeObserver.observe(shelfRef.value);
  props.absService.onLibraryUpdate(() => reset());
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

watch(() => [props.sortMethod, props.desc], () => reset(), { deep: true });

const totalHeight = computed(() => {
  if (totalEntities.value === 0) return 400;
  return layout.totalRows * layout.shelfHeight + (props.isStreaming ? 180 : 80);
});
</script>

<template>
  <div 
    ref="shelfRef"
    class="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative h-full"
    @scroll="handleScroll"
  >
    <div :style="{ height: totalHeight + 'px' }" class="relative w-full">
      <div v-if="totalEntities === 0 && !loadingPages.size" class="absolute inset-0 flex flex-col items-center justify-center text-center opacity-40">
        <PackageOpen :size="64" class="text-neutral-800 mb-6" />
        <h3 class="text-xl font-black uppercase tracking-tighter">No Stacks Established</h3>
        <p class="text-[9px] font-black uppercase tracking-widest mt-2">Archives are not categorized by series</p>
      </div>

      <template v-for="entity in visibleEntities" :key="entity.index">
        <div 
          class="absolute transition-transform duration-500"
          :style="{ 
            transform: `translate3d(${entity.x}px, ${entity.y}px, 0)`,
            width: layout.cardWidth + 'px',
            height: layout.cardHeight + 'px'
          }"
        >
          <div v-if="!entity.data" class="w-full h-full animate-pulse flex items-center justify-center bg-neutral-900/40 border border-white/5 rounded-[24px]">
            <Activity :size="20" class="text-neutral-800" />
          </div>

          <SeriesCard 
            v-else
            :series="entity.data"
            :coverUrl="absService.getCoverUrl(entity.data.books?.[0]?.id || '')"
            @click="emit('select-series', entity.data)"
            class="animate-fade-in"
          />
        </div>
      </template>
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
