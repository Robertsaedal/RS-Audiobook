<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
const seriesBooks = ref<ABSLibraryItem[]>([]);
const isLoadingBooks = ref(true);
const isScanning = ref(false);
const scanFeedback = ref('');

const firstBookCover = computed(() => {
  // Use the fetched books if available, otherwise fallback to prop data
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

// Sort logic that handles floating point sequences correctly
const sortedBooks = computed(() => {
  // Prefer the freshly fetched books which have full metadata and progress
  const books = seriesBooks.value.length > 0 ? seriesBooks.value : (localSeries.value.books || []);
  
  return [...books].sort((a, b) => {
    // Access sequence from flat property or nested series array
    const getSeq = (item: ABSLibraryItem) => {
      const meta = item.media.metadata;
      // 1. Try explicit seriesSequence
      if (meta.seriesSequence !== undefined && meta.seriesSequence !== null) return parseFloat(String(meta.seriesSequence));
      // 2. Try sequence property
      if (meta.sequence !== undefined && meta.sequence !== null) return parseFloat(String(meta.sequence));
      // 3. Look inside series array if available
      if (Array.isArray((meta as any).series) && (meta as any).series.length > 0) {
         const match = (meta as any).series.find((s: any) => s.id === localSeries.value.id);
         if (match && match.sequence) return parseFloat(String(match.sequence));
      }
      return 999999;
    };

    return getSeq(a) - getSeq(b);
  });
});

const fetchBooks = async () => {
  isLoadingBooks.value = true;
  try {
    // Fetch books via the Item endpoint to ensure we get userProgress and full metadata
    const books = await props.absService.getSeriesBooks(localSeries.value.id);
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

onMounted(() => {
  fetchBooks();
  
  props.absService.onProgressUpdate((updated) => {
    // Update both localSeries ref and seriesBooks ref
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

        <div v-if="isLoadingBooks && seriesBooks.length === 0" class="flex justify-center py-20">
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