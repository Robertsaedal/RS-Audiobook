<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ABSSeries, ABSLibraryItem } from '../types';
import { ABSService } from '../services/absService';
import BookCard from '../components/BookCard.vue';
import { ChevronLeft, Clock, Layers, RotateCw, Play } from 'lucide-vue-next';

const props = defineProps<{
  series: ABSSeries,
  absService: ABSService
}>();

const emit = defineEmits<{
  (e: 'back'): void,
  (e: 'select-item', item: ABSLibraryItem): void
}>();

const localSeries = ref({ ...props.series });
const isScanning = ref(false);
const scanFeedback = ref('');

const firstBookCover = computed(() => {
  if (localSeries.value.books && localSeries.value.books.length > 0) {
    return props.absService.getCoverUrl(localSeries.value.books[0].id);
  }
  return '';
});

const totalDurationPretty = computed(() => {
  const totalSeconds = localSeries.value.books.reduce((acc, book) => acc + (book.media.duration || 0), 0);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
});

const sortedBooks = computed(() => {
  return [...localSeries.value.books].sort((a, b) => {
    const seqA = parseFloat(a.media.metadata.sequence || '0');
    const seqB = parseFloat(b.media.metadata.sequence || '0');
    return seqA - seqB;
  });
});

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
  props.absService.onProgressUpdate((updated) => {
    const bookIndex = localSeries.value.books.findIndex(b => b.id === updated.itemId);
    if (bookIndex !== -1) {
      localSeries.value.books[bookIndex] = { 
        ...localSeries.value.books[bookIndex], 
        userProgress: updated 
      };
    }
  });
});
</script>

<template>
  <div class="flex flex-col min-h-full animate-fade-in relative bg-[#0d0d0d]">
    <section class="relative h-[50vh] -mx-8 md:-mx-16 lg:-mx-20 -mt-12 overflow-hidden mb-16 group">
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
              Series • {{ localSeries.books.length }} Items • {{ totalDurationPretty }}
            </span>
          </div>
          <button class="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-full shadow-lg shadow-purple-600/20 transition-all active:scale-95">
            <Play :size="16" fill="currentColor" />
            <span class="text-[10px] font-black uppercase tracking-[0.3em]">Play Sequence</span>
          </button>
        </div>
      </div>
    </section>

    <section class="space-y-12 pb-40">
      <div class="flex items-center justify-between px-2">
        <div class="flex items-center gap-3 text-neutral-700">
          <Layers :size="12" />
          <h3 class="text-[9px] font-black uppercase tracking-[0.5em]">Timeline View</h3>
        </div>
        <div class="h-px flex-1 bg-white/5 mx-8 hidden md:block" />
        <div class="text-[9px] font-black uppercase tracking-widest text-neutral-600">Ascending Order</div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-8 gap-y-16">
        <BookCard 
          v-for="book in sortedBooks" 
          :key="book.id" 
          :item="book" 
          :coverUrl="absService.getCoverUrl(book.id)" 
          show-metadata
          @click="emit('select-item', book)" 
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fade-in 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
@keyframes fade-in {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>