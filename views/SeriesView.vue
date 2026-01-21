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
// Initialize with props data immediately to prevent flash
const seriesBooks = ref<ABSLibraryItem[]>(props.series.books || []);
const isLoadingBooks = ref(false);
const isScanning = ref(false);
const scanFeedback = ref('');

const firstBookCover = computed(() => {
  const books = seriesBooks.value.length > 0 ? seriesBooks.value : localSeries.value.books;
  if (books && books.length > 0) {
    return props.absService.getCoverUrl(books[0].id);
  }
  return '';
});

const totalDurationPretty = computed(() => {
  const books = seriesBooks.value.length > 0 ? seriesBooks.value : localSeries.value.books;
  const totalSeconds = books?.reduce((acc, book) => acc + (book.media.duration || 0), 0) || 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
});

// Helper to reliably get sequence for sorting and display
const getSequence = (item: ABSLibraryItem) => {
  const meta = item.media.metadata;
  
  // 1. Check direct property on item (often populated by server in series view context)
  if ((item as any).sequence !== undefined && (item as any).sequence !== null && String((item as any).sequence).trim() !== '') {
    return String((item as any).sequence);
  }

  // 2. Check explicit seriesSequence in metadata
  if (meta.seriesSequence !== undefined && meta.seriesSequence !== null) {
    return String(meta.seriesSequence);
  }

  // 3. Check nested series array (Standard ABS item structure)
  if (Array.isArray((meta as any).series) && (meta as any).series.length > 0) {
    const seriesList = (meta as any).series;
    
    // A. Exact ID match (Best)
    let s = seriesList.find((s: any) => s.id === localSeries.value.id);
    
    // B. Loose ID Match (string vs number)
    if (!s) s = seriesList.find((s: any) => s.id == localSeries.value.id);

    // C. Name Match (Fallback)
    if (!s && localSeries.value.name) {
       s = seriesList.find((s: any) => s.name === localSeries.value.name);
    }

    // D. Aggressive Fallback: In Series View, assume the first series entry IS the sequence we want
    // This fixes cases where Series ID in View doesn't match ID in Book Metadata perfectly due to stale data
    if (!s && seriesList.length > 0) {
       s = seriesList[0];
    }

    if (s && s.sequence !== undefined && s.sequence !== null) {
      return String(s.sequence);
    }
  }

  // 4. Check simple sequence property on metadata
  if (meta.sequence !== undefined && meta.sequence !== null) {
    return String(meta.sequence);
  }

  return null;
};

const sortedBooks = computed(() => {
  // Use localSeries.books if seriesBooks is empty to prevent flash of empty content
  const books = seriesBooks.value.length > 0 ? seriesBooks.value : (localSeries.value.books || []);
  
  return [...books].sort((a, b) => {
    const seqA = parseFloat(getSequence(a) || '999999');
    const seqB = parseFloat(getSequence(b) || '999999');
    return seqA - seqB;
  });
});

const fetchBooks = async () => {
  if (!props.series.id) return;
  
  // If props.series ALREADY has books, rely on it first, but fetch in background to get updates
  // This prevents the "0 books" flash if data was passed correctly from Library
  if (props.series.books && props.series.books.length > 0) {
      seriesBooks.value = props.series.books;
  } else {
      isLoadingBooks.value = true;
  }
  
  try {
    // Pass Series Name to allow for "Name Match" fallback if ID match fails
    const books = await props.absService.getSeriesBooks(props.series.id, props.series.name);
    
    if (books && books.length > 0) {
      seriesBooks.value = books;
    } else {
        console.warn(`[SeriesView] No books returned for series ${props.series.id} (Name: ${props.series.name})`);
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
  scanFeedback.value = '';
  try {
    const success = await props.absService.scanLibrary();
    if (success) {
      scanFeedback.value = 'Scan Initiated';
      setTimeout(() => scanFeedback.value = '', 3000);
    }
  } catch (e) {
    scanFeedback.value = 'Scan Failed';
    setTimeout(() => scanFeedback.value = '', 4000);
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
    const updateList = (list: ABSLibraryItem[]) => {
      const idx = list.findIndex(b => b.id === updated.itemId);
      if (idx !== -1) {
        list[idx] = { ...list[idx], userProgress: updated };
      }
    };
    if (localSeries.value.books) updateList(localSeries.value.books);
    updateList(seriesBooks.value);
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
        <div class="absolute inset-0 bg-gradient-to-r from-[#0d0d0d] via-transparent to-transparent" />

        <div class="absolute top-8 left-8 right-8 flex justify-between items-center z-30">
          <button 
            @click="emit('back')" 
            class="flex items-center gap-2 px-5 py-2.5 bg-black/40 backdrop-blur-xl border border-white/5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white transition-all active:scale-95"
          >
            <ChevronLeft :size="14" />
            <span>Archives</span>
          </button>

          <div class="flex items-center gap-4">
            <div v-if="scanFeedback" class="px-4 py-2 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-widest animate-fade-in" :class="scanFeedback === 'Scan Failed' ? 'text-red-500' : 'text-purple-400'">
              {{ scanFeedback }}
            </div>
            <button @click="scanLibrary" class="group p-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/5 hover:border-purple-500/30 transition-all active:scale-95">
              <RotateCw :size="18" class="text-neutral-500 group-hover:text-purple-500 transition-colors" :class="{ 'animate-spin text-purple-500': isScanning }" />
            </button>
          </div>
        </div>

        <div class="absolute bottom-12 left-8 md:left-12 lg:left-16 right-8 z-20 space-y-6">
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-purple-500/60">
              <Layers :size="12" />
              <span class="text-[9px] font-black uppercase tracking-[0.4em]">Collection Artifact</span>
            </div>
            <h1 class="text-5xl md:text-7xl lg:text-8xl font-black uppercase tracking-tighter leading-none text-white drop-shadow-2xl">
              {{ localSeries.name }}
            </h1>
          </div>
          <div class="flex flex-wrap items-center gap-y-4 gap-x-8">
            <div class="flex items-center gap-3">
              <div class="w-1.5 h-1.5 bg-purple-500 rounded-full shadow-[0_0_8px_#A855F7]" />
              <span class="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-300">
                Series • {{ sortedBooks.length }} Items • {{ totalDurationPretty }}
              </span>
            </div>
            <button class="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-full shadow-lg shadow-purple-600/20 transition-all active:scale-95">
              <Play :size="16" fill="currentColor" />
              <span class="text-[10px] font-black uppercase tracking-[0.3em]">Play Sequence</span>
            </button>
          </div>
        </div>
      </section>

      <section class="space-y-12 pb-40 px-4 md:px-0">
        <div class="flex items-center justify-between px-2">
          <div class="flex items-center gap-3 text-neutral-700">
            <Layers :size="12" />
            <h3 class="text-[9px] font-black uppercase tracking-[0.5em]">Timeline View</h3>
          </div>
          <div class="h-px flex-1 bg-white/5 mx-8 hidden md:block" />
          <div class="text-[9px] font-black uppercase tracking-widest text-neutral-600">Sequential Order</div>
        </div>

        <div v-if="isLoadingBooks && sortedBooks.length === 0" class="flex justify-center py-20">
           <Loader2 class="animate-spin text-purple-500" :size="32" />
        </div>

        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-8 gap-y-16">
          <BookCard 
            v-for="(book) in sortedBooks" 
            :key="book.id" 
            :item="book" 
            :coverUrl="absService.getCoverUrl(book.id)" 
            show-metadata
            show-progress
            :fallbackSequence="getSequence(book)"
            @click="emit('select-item', book)" 
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fade-in 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
@keyframes fade-in {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>