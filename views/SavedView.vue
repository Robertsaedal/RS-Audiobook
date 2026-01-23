
<script setup lang="ts">
import { ref, onMounted, computed, onActivated } from 'vue';
import { ABSLibraryItem } from '../types';
import { OfflineManager } from '../services/offlineManager';
import BookCard from '../components/BookCard.vue';
import { Trash2, Smartphone, Heart, Bookmark, AlertCircle, Info, DownloadCloud } from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'select-item', item: ABSLibraryItem): void,
  (e: 'info-click', item: ABSLibraryItem): void
}>();

const downloadedBooks = ref<ABSLibraryItem[]>([]);
const wishlistedBooks = ref<ABSLibraryItem[]>([]);
const isLoading = ref(true);

const fetchAll = async () => {
  isLoading.value = true;
  try {
    const [downloads, wishlist] = await Promise.all([
      OfflineManager.getAllDownloadedBooks(),
      OfflineManager.getAllWishlisted()
    ]);
    downloadedBooks.value = downloads;
    wishlistedBooks.value = wishlist;
  } catch (e) {
    console.error("Failed to fetch saved archives", e);
  } finally {
    isLoading.value = false;
  }
};

const removeDownload = async (book: ABSLibraryItem) => {
  if (confirm(`Remove audio for "${book.media.metadata.title}" from local storage?`)) {
    try {
      await OfflineManager.removeBook(book.id);
      downloadedBooks.value = downloadedBooks.value.filter(b => b.id !== book.id);
    } catch (e) {
      alert("Failed to remove artifact from local storage.");
    }
  }
};

onMounted(fetchAll);
onActivated(fetchAll); // Ensure fresh data when navigating back

const statsLabel = computed(() => {
  const dCount = downloadedBooks.value.length;
  const wCount = wishlistedBooks.value.length;
  return `${dCount} Offline • ${wCount} Wishlisted`;
});
</script>

<template>
  <div class="h-full flex flex-col animate-fade-in pb-40">
    <!-- Header Section -->
    <div class="pt-8 pb-12">
      <div class="flex items-end justify-between border-b border-white/5 pb-8">
        <div>
          <h1 class="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white mb-2">My Collection</h1>
          <div class="flex items-center gap-3">
            <Bookmark :size="12" class="text-purple-500" />
            <p class="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-500">{{ statsLabel }}</p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="flex-1 flex flex-col items-center justify-center gap-4 opacity-50">
      <div class="w-10 h-10 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
      <span class="text-[9px] font-black uppercase tracking-widest">Querying Vault...</span>
    </div>

    <div v-else class="space-y-20">
      <!-- Section 1: Downloads -->
      <section>
        <div class="flex items-center gap-3 mb-10 px-1">
          <Smartphone :size="16" class="text-emerald-500" />
          <h2 class="text-xl font-black uppercase tracking-tighter text-white">Local Vault</h2>
          <div class="h-px flex-1 bg-white/5 mx-6 hidden md:block"></div>
          <span class="text-[10px] font-black text-neutral-600 uppercase tracking-widest">{{ downloadedBooks.length }} Items</span>
        </div>

        <div v-if="downloadedBooks.length === 0" class="flex flex-col items-center justify-center py-12 text-center opacity-30 bg-white/5 rounded-3xl border border-dashed border-white/10">
          <DownloadCloud :size="40" class="mb-4" />
          <p class="text-[10px] font-black uppercase tracking-widest">No local artifacts stored</p>
        </div>

        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-8 gap-y-16">
          <div v-for="book in downloadedBooks" :key="book.id" class="relative group">
            <BookCard 
              :item="book" 
              :coverUrl="''" 
              show-metadata 
              show-progress 
              @click="emit('select-item', book)" 
              @info-click="emit('info-click', book)"
            />
            <button 
              @click.stop="removeDownload(book)"
              class="absolute -top-3 -right-3 z-[60] p-3 rounded-full bg-red-600/90 text-white shadow-xl hover:bg-red-500 hover:scale-110 active:scale-90 transition-all border border-red-400/20 opacity-100 md:opacity-0 group-hover:opacity-100"
              title="Delete audio files"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </section>

      <!-- Section 2: Wishlist -->
      <section>
        <div class="flex items-center gap-3 mb-10 px-1">
          <Heart :size="16" class="text-purple-500" fill="currentColor" />
          <h2 class="text-xl font-black uppercase tracking-tighter text-white">Want to Listen</h2>
          <div class="h-px flex-1 bg-white/5 mx-6 hidden md:block"></div>
          <span class="text-[10px] font-black text-neutral-600 uppercase tracking-widest">{{ wishlistedBooks.length }} Items</span>
        </div>

        <div v-if="wishlistedBooks.length === 0" class="flex flex-col items-center justify-center py-12 text-center opacity-30 bg-white/5 rounded-3xl border border-dashed border-white/10">
          <Heart :size="40" class="mb-4" />
          <p class="text-[10px] font-black uppercase tracking-widest">Your wishlist is empty</p>
        </div>

        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-8 gap-y-16">
          <div v-for="book in wishlistedBooks" :key="book.id">
            <BookCard 
              :item="book" 
              :coverUrl="''" 
              show-metadata 
              @click="emit('select-item', book)" 
              @info-click="emit('info-click', book)"
            />
          </div>
        </div>
      </section>

      <!-- Storage Protocol Banner -->
      <div v-if="downloadedBooks.length > 0" class="mt-20 p-6 bg-purple-900/10 border border-purple-500/20 rounded-[32px] flex items-center gap-6">
        <div class="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center shrink-0">
          <AlertCircle :size="20" class="text-purple-500" />
        </div>
        <div>
          <h4 class="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-1">Local Storage Integrity</h4>
          <p class="text-[10px] text-neutral-500 font-medium leading-relaxed">
            Downloaded artifacts are stored in your browser's persistent storage. If you clear site data, offline access to these artifacts will be revoked.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fade-in 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
