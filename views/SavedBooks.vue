
<script setup lang="ts">
import { ref, onMounted, computed, onActivated } from 'vue';
import { ABSLibraryItem } from '../types';
import { OfflineManager } from '../services/offlineManager';
import BookCard from '../components/BookCard.vue';
import { Trash2, Smartphone, Heart, Bookmark, AlertCircle, Info, DownloadCloud, Library } from 'lucide-vue-next';

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
    console.error("Archive retrieval failure", e);
  } finally {
    isLoading.value = false;
  }
};

const removeDownload = async (book: ABSLibraryItem) => {
  if (confirm(`Purge audio artifacts for "${book.media.metadata.title}" from local vault?`)) {
    try {
      await OfflineManager.removeBook(book.id);
      downloadedBooks.value = downloadedBooks.value.filter(b => b.id !== book.id);
    } catch (e) {
      alert("Failed to purge artifact.");
    }
  }
};

onMounted(fetchAll);
onActivated(fetchAll);

const collectionStats = computed(() => {
  return `${downloadedBooks.value.length} Vaulted • ${wishlistedBooks.value.length} Flagged`;
});
</script>

<template>
  <div class="h-full flex flex-col animate-fade-in pb-40">
    <!-- Archive Header -->
    <div class="pt-8 pb-12">
      <div class="flex items-end justify-between border-b border-white/5 pb-8">
        <div>
          <h1 class="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white mb-2">Saved Collection</h1>
          <div class="flex items-center gap-3">
            <Library :size="12" class="text-purple-500" />
            <p class="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-500">{{ collectionStats }}</p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="flex-1 flex flex-col items-center justify-center gap-4 opacity-50">
      <div class="w-10 h-10 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
      <span class="text-[9px] font-black uppercase tracking-widest">Querying Vault...</span>
    </div>

    <div v-else class="space-y-24">
      <!-- Section 1: Offline Vault -->
      <section>
        <div class="flex items-center gap-3 mb-10 px-1">
          <Smartphone :size="16" class="text-emerald-500" />
          <h2 class="text-xl font-black uppercase tracking-tighter text-white">Local Vault</h2>
          <div class="h-px flex-1 bg-white/5 mx-6 hidden md:block"></div>
          <span class="text-[10px] font-black text-neutral-700 uppercase tracking-widest">{{ downloadedBooks.length }} Offline</span>
        </div>

        <div v-if="downloadedBooks.length === 0" class="flex flex-col items-center justify-center py-20 text-center opacity-30 border-2 border-dashed border-white/5 rounded-[40px] bg-white/[0.02]">
          <DownloadCloud :size="40" class="mb-4 text-neutral-800" />
          <p class="text-[10px] font-black uppercase tracking-widest">No artifacts stored on this device</p>
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
              class="absolute -top-3 -right-3 z-[60] p-3 rounded-full bg-red-600 text-white shadow-[0_10px_30px_rgba(220,38,38,0.4)] hover:bg-red-500 hover:scale-110 active:scale-90 transition-all border border-red-400/20 md:opacity-0 group-hover:opacity-100"
              title="Wipe Local Data"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </section>

      <!-- Section 2: Want to Listen -->
      <section>
        <div class="flex items-center gap-3 mb-10 px-1">
          <Heart :size="16" class="text-purple-500" fill="currentColor" />
          <h2 class="text-xl font-black uppercase tracking-tighter text-white">Want to Listen</h2>
          <div class="h-px flex-1 bg-white/5 mx-6 hidden md:block"></div>
          <span class="text-[10px] font-black text-neutral-700 uppercase tracking-widest">{{ wishlistedBooks.length }} Flagged</span>
        </div>

        <div v-if="wishlistedBooks.length === 0" class="flex flex-col items-center justify-center py-20 text-center opacity-30 border-2 border-dashed border-white/5 rounded-[40px] bg-white/[0.02]">
          <Heart :size="40" class="mb-4 text-neutral-800" />
          <p class="text-[10px] font-black uppercase tracking-widest">Wishlist registry is empty</p>
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

      <!-- Storage Banner -->
      <div v-if="downloadedBooks.length > 0" class="mt-20 p-8 bg-neutral-900/60 border border-white/5 rounded-[40px] flex items-center gap-8 backdrop-blur-xl">
        <div class="w-16 h-16 rounded-3xl bg-purple-500/10 flex items-center justify-center shrink-0 border border-purple-500/20 shadow-inner">
          <AlertCircle :size="24" class="text-purple-500" />
        </div>
        <div>
          <h4 class="text-[11px] font-black uppercase tracking-widest text-purple-400 mb-2">Vault Integrity Protocol</h4>
          <p class="text-[10px] text-neutral-500 font-medium leading-relaxed max-w-xl">
            Downloaded artifacts are stored in your device's persistent browser storage. These items persist independently of the wishlist registry.
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
