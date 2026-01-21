<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ABSSeries, ABSLibraryItem } from '../types';
import { ABSService } from '../services/absService';
import BookCard from '../components/BookCard.vue';
import { ChevronLeft, Layers, RotateCw, Play, Loader2 } from 'lucide-vue-next';

const props = defineProps<{
  series: ABSSeries,
  absService: ABSService
}>();

const emit = defineEmits<{
  (e: 'back'): void,
  (e: 'select-item', item: ABSLibraryItem): void
}>();

const localSeries = ref({ ...props.series });
const seriesBooks = ref<ABSLibraryItem[]>(props.series.books || []);
const isLoadingBooks = ref(false);
const isScanning = ref(false);
const scanFeedback = ref('');

const firstBookCover = computed(() => {
  const books = seriesBooks.value.length > 0 ? seriesBooks.value : (localSeries.value.books || []);
  if (books.length > 0) {
    return props.absService.getCoverUrl(books[0].id);
  }
  return '';
});

const totalDurationPretty = computed(() => {
  const books = seriesBooks.value.length > 0 ? seriesBooks.value : (localSeries.value.books || []);
  const totalSeconds = books.reduce((acc, book) => acc + (book.media?.duration || 0), 0);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
});

// Optimized sequence getter for stability in production builds
const getSequence = (item: ABSLibraryItem) => {
  const meta = item.media?.metadata;
  if (!meta) return null;

  // 1. Direct property check
  if ((item as any).sequence) return String((item as any).sequence);

  // 2. Explicit metadata check
  if (meta.seriesSequence) return String(meta.seriesSequence);

  // 3. Nested series array check
  if (Array.isArray(meta.series) && meta.series.length > 0) {
    // Try to find the sequence for THIS specific series
    const s = meta.series.find((s: any) => s.id === props.series.id) || meta.series[0];
    if (s && s.sequence) return String(s.sequence);
  }

  // 4. Fallback: Parse from seriesName string
  if (meta.seriesName) {
    const match = meta.seriesName.match(/#\s*([0-9.]+)/);
    if (match) return match[1];
  }

  return null;
};

const sortedBooks = computed(() => {
  const books = seriesBooks.value.length > 0 ? seriesBooks.value : (localSeries.value.books || []);
  
  return [...books].sort((a, b) => {
    const seqA = parseFloat(getSequence(a) || '999999');
    const seqB = parseFloat(getSequence(b) || '999999');
    return seqA - seqB;
  });
});

const fetchBooks = async () => {
  if (!props.series.id) return;
  
  if (!props.series.books || props.series.books.length === 0) {
    isLoadingBooks.value = true;
  } else {
    seriesBooks.value = props.series.books;
  }
  
  try {
    const books = await props.absService.getSeriesBooks(props.series.id, props.series.name);
    if (books && books.length > 0) {
      seriesBooks.value = books;
    }
  } catch (e) {
    console.error("Failed to fetch series books", e);
  } finally {
    isLoadingBooks.value = false;
  }
};

const scanLibrary = async () => {
  if (isScanning.value) return;
  isScanning.value = true;
  try {
    const success = await props.absService.scanLibrary();
    scanFeedback.value = success ? 'Scan Initiated' : 'Scan Failed';
    setTimeout(() => scanFeedback.value = '', 3000);
  } catch (e) {
    scanFeedback.value = 'Scan Failed';
    setTimeout(() => scanFeedback.value = '', 3000);
  } finally {
    isScanning.value = false;
  }
};

watch(() => props.series.id, (newId) => {
  if (newId) {
    localSeries.value = { ...props.series };
    seriesBooks.value = props.series.books || [];
    fetchBooks();
  }
});

onMounted(() => {
  fetchBooks();
  
  props.absService.onProgressUpdate((updated) => {
    const updateInList = (list: ABSLibraryItem[]) => {
      const idx = list.findIndex(b => b.id === updated.itemId);
      if (idx !== -1) {
        list[idx] = { ...list[idx], userProgress: updated };
      }
    };
    updateInList(seriesBooks.value);
  });
});
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden animate-fade-in relative bg-[#0d0d0d] -mx-4 md:-mx-8">
    <div class="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8">
      <section class="relative h-[50vh] -mx-4 md:-mx-8 overflow-hidden mb-16 group">
        <div 
          class="absolute inset-0 bg-cover bg-center scale-110 blur-[40px] opacity-30 transition-transform duration-[5s] group-hover:scale-125"
          :style="{ backgroundImage: `url(${firstBookCover})` }"
        />
        <div class="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d]/40 to-transparent" />
        
        <div class="absolute top-8 left-8 right-8 flex justify-between items-center z-30">
          <button @click="emit('back')" class="flex items-center gap-2 px-5 py-2.5 bg-black/40 backdrop-blur-xl border border-white/5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white transition-all">
            <ChevronLeft :size="14" />
            <span>Archives</span>
          </button>

          <div class="flex items-center gap-4">
            <div v-if="scanFeedback" class="px-4 py-2 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-widest text-purple-400">
              {{ scanFeedback }}
            </div>
            <button @click="scanLibrary" class="p-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/5 hover:border-purple-500/30 transition-all">
              <RotateCw :size="18" class="text-neutral-500" :class="{ 'animate-spin text-purple-500': isScanning }" />
            </button>
          </div>
        </div>

        <div class="absolute bottom-12 left-8 md:left-12 right-8 z-20 space-y-6">
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-purple-500/60">
              <Layers :size="12" />
              <span class="text-[9px] font-black uppercase tracking-[0.4em]">Collection Artifact</span>
            </div>
            <h1 class="text-5xl md:text-7xl font-black uppercase tracking-tighter text-white">
              {{ localSeries.name }}
            </h1>
            <div v-if="localSeries.description" v-html="localSeries.description" class="text-neutral-400 text-xs max-w-2xl line-clamp-3"></div>
          </div>
          <div class="flex items-center gap-8">
            <span class="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-300">
              {{ sortedBooks.length }} Items • {{ totalDurationPretty }}
            </span>
            <button class="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-full transition-all">
              <Play :size="16" fill="currentColor" />
              <span class="text-[10px] font-black uppercase tracking-[0.3em]">Play</span>
            </button>
          </div>
        </div>
      </section>

      <section class="space-y-12 pb-40 px-4 md:px-0">
        <div v-if="isLoadingBooks" class="flex justify-center py-20">
           <Loader2 class="animate-spin text-purple-500" :size="32" />
        </div>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-16">
          <BookCard 
            v-for="book in sortedBooks" 
            :key="book.id" 
            :item="book" 
            :coverUrl="absService.getCoverUrl(book.id)" 
            show-metadata
            show-progress
            :fallback-sequence="getSequence(book)"
            @click="emit('select-item', book)" 
          />
        </div>
      </section>
    </div>
  </div>
</template>