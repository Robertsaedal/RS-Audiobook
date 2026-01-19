
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, reactive, nextTick } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { ABSService, LibraryQueryParams } from '../services/absService';
import BookCard from './BookCard.vue';
import { PackageOpen, Activity, MousePointer2 } from 'lucide-vue-next';

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

// Layout State
const bookshelfRef = ref<HTMLElement | null>(null);
const containerWidth = ref(0);
const containerHeight = ref(0);
const scrollTop = ref(0);

// Data State
const entities = ref<(ABSLibraryItem | null)[]>([]);
const totalEntities = ref(0);
const loadingPages = new Set<number>();
const selectedIds = ref<Set<string>>(new Set());
const lastSelectedIndex = ref(-1);

// Configuration Constants (Aether Theme Specs)
const CARD_ASPECT_RATIO = 1.5; // 2:3
const MIN_CARD_WIDTH = 140;
const CARD_GUTTER = 24;
const SHELF_PADDING_Y = 40;
const ITEMS_PER_FETCH = 48;

// Computed Layout Logic
const layout = reactive({
  cardWidth: 0,
  cardHeight: 0,
  entitiesPerRow: 0,
  totalRows: 0,
  shelfHeight: 0,
  marginLeft: 0
});

const calculateLayout = () => {
  if (!bookshelfRef.value) return;
  const width = bookshelfRef.value.clientWidth;
  const height = bookshelfRef.value.clientHeight;
  containerWidth.value = width;
  containerHeight.value = height;

  // Calculate how many fit
  const availableWidth = width - 48; // Padding
  layout.entitiesPerRow = Math.max(2, Math.floor(availableWidth / (MIN_CARD_WIDTH + CARD_GUTTER)));
  layout.cardWidth = Math.floor((availableWidth - (layout.entitiesPerRow - 1) * CARD_GUTTER) / layout.entitiesPerRow);
  layout.cardHeight = layout.cardWidth * CARD_ASPECT_RATIO;
  layout.shelfHeight = layout.cardHeight + SHELF_PADDING_Y;
  layout.totalRows = Math.ceil(totalEntities.value / layout.entitiesPerRow);
  layout.marginLeft = (width - (layout.entitiesPerRow * layout.cardWidth + (layout.entitiesPerRow - 1) * CARD_GUTTER)) / 2;
};

// Virtual Visibility Logic
const visibleRange = computed(() => {
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

// Data Fetching
const fetchPage = async (page: number) => {
  if (loadingPages.has(page)) return;
  loadingPages.add(page);

  try {
    const params: LibraryQueryParams = {
      limit: ITEMS_PER_FETCH,
      offset: page * ITEMS_PER_FETCH,
      sort: props.sortMethod.toLowerCase(),
      desc: props.desc,
      search: props.search
    };
    
    const { results, total } = await props.absService.getLibraryItemsPaged(params);
    
    if (totalEntities.value !== total) {
      totalEntities.value = total;
      entities.value = new Array(total).fill(null);
      calculateLayout();
    }

    results.forEach((item, idx) => {
      entities.value[page * ITEMS_PER_FETCH + idx] = item;
    });
  } catch (e) {
    console.error("Failed to fetch shelf page", e);
  } finally {
    loadingPages.delete(page);
  }
};

const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement;
  scrollTop.value = target.scrollTop;
  
  // Check if we need to load pages in range
  const { start, end } = visibleRange.value;
  const startPage = Math.floor(start / ITEMS_PER_FETCH);
  const endPage = Math.floor(end / ITEMS_PER_FETCH);

  for (let p = startPage; p <= endPage; p++) {
    if (p * ITEMS_PER_FETCH < totalEntities.value && !entities.value[p * ITEMS_PER_FETCH]) {
      fetchPage(p);
    }
  }
};

const reset = async () => {
  entities.value = [];
  totalEntities.value = 0;
  scrollTop.value = 0;
  if (bookshelfRef.value) bookshelfRef.value.scrollTop = 0;
  await fetchPage(0);
  calculateLayout();
};

// Selection Logic
const handleSelect = (item: ABSLibraryItem, index: number, event: MouseEvent) => {
  if (event.shiftKey && lastSelectedIndex.value !== -1) {
    const start = Math.min(index, lastSelectedIndex.value);
    const end = Math.max(index, lastSelectedIndex.value);
    for (let i = start; i <= end; i++) {
      const ent = entities.value[i];
      if (ent) selectedIds.value.add(ent.id);
    }
  } else if (event.ctrlKey || event.metaKey || selectedIds.value.size > 0) {
    if (selectedIds.value.has(item.id)) {
      selectedIds.value.delete(item.id);
    } else {
      selectedIds.value.add(item.id);
    }
  } else {
    emit('select-item', item);
  }
  lastSelectedIndex.value = index;
};

// Lifecycle
let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  reset();
  resizeObserver = new ResizeObserver(calculateLayout);
  if (bookshelfRef.value) resizeObserver.observe(bookshelfRef.value);

  props.absService.onProgressUpdate((updated: ABSProgress) => {
    const index = entities.value.findIndex(i => i?.id === updated.itemId);
    if (index !== -1) {
      entities.value[index] = { ...entities.value[index]!, userProgress: updated };
    }
  });

  props.absService.onLibraryUpdate(() => reset());
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

watch(() => [props.sortMethod, props.desc, props.search], () => reset(), { deep: true });

const totalHeight = computed(() => layout.totalRows * layout.shelfHeight + (props.isStreaming ? 180 : 80));
</script>

<template>
  <div 
    ref="bookshelfRef"
    class="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar relative"
    @scroll="handleScroll"
  >
    <!-- Total Height Spacer -->
    <div :style="{ height: totalHeight + 'px' }" class="relative w-full">
      
      <!-- Empty State -->
      <div v-if="totalEntities === 0 && !loadingPages.size" class="absolute inset-0 flex flex-col items-center justify-center text-center opacity-40">
        <PackageOpen :size="64" class="text-neutral-800 mb-6" />
        <h3 class="text-xl font-black uppercase tracking-tighter">Repository Empty</h3>
        <p class="text-[9px] font-black uppercase tracking-widest mt-2">No artifacts detected in sector</p>
      </div>

      <!-- Virtual Entities -->
      <template v-for="entity in visibleEntities" :key="entity.index">
        <div 
          class="absolute transition-transform duration-500"
          :style="{ 
            transform: `translate3d(${entity.x}px, ${entity.y}px, 0)`,
            width: layout.cardWidth + 'px',
            height: layout.cardHeight + 'px'
          }"
        >
          <!-- Aether Skeleton -->
          <div v-if="!entity.data" class="w-full h-full bg-neutral-900/40 rounded-[28px] border border-white/5 animate-pulse flex items-center justify-center">
            <Activity :size="20" class="text-neutral-800" />
          </div>

          <!-- Real Card -->
          <BookCard 
            v-else
            :item="entity.data"
            :coverUrl="absService.getCoverUrl(entity.data.id)"
            :isSelected="selectedIds.has(entity.data.id)"
            class="animate-fade-in"
            @click="handleSelect(entity.data, entity.index, $event)"
          />

          <!-- Selection Badge -->
          <div v-if="selectedIds.has(entity.data?.id || '')" class="absolute -top-2 -right-2 z-30 bg-purple-600 p-2 rounded-full border-2 border-black shadow-lg">
            <MousePointer2 :size="12" class="text-white fill-current" />
          </div>
        </div>
      </template>

      <!-- Shelf Dividers (Aether Styled) -->
      <template v-for="i in Math.ceil(containerHeight / layout.shelfHeight) + 2" :key="'shelf-' + i">
        <div 
          class="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/10 to-transparent pointer-events-none"
          :style="{ 
            top: (Math.floor(scrollTop / layout.shelfHeight) + i - 1) * layout.shelfHeight + layout.cardHeight + 12 + 'px' 
          }"
        />
      </template>
    </div>

    <!-- Batch Actions (Floating) -->
    <Transition name="slide-up">
      <div v-if="selectedIds.size > 0" class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-neutral-900/80 backdrop-blur-2xl border border-purple-500/30 px-8 py-4 rounded-[32px] flex items-center gap-6 shadow-2xl animate-slide-up">
        <div class="flex flex-col">
          <span class="text-[10px] font-black uppercase tracking-widest text-purple-500">Selection Active</span>
          <span class="text-xs font-black uppercase tracking-tighter text-white">{{ selectedIds.size }} Artifacts</span>
        </div>
        <div class="h-8 w-px bg-white/10" />
        <button @click="selectedIds.clear()" class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 hover:text-white transition-colors">Clear</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fade-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes fade-in {
  from { opacity: 0; transform: scale(0.9) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translate(-50%, 100%);
  opacity: 0;
}
</style>
