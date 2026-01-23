
<script setup lang="ts">
import { ref, onMounted, onActivated, computed } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { OfflineManager, downloadQueue } from '../services/offlineManager';
import { ABSService } from '../services/absService';
import BookCard from '../components/BookCard.vue';
import { Trash2, PackageOpen, Download, Heart, HardDrive, X } from 'lucide-vue-next';

const props = defineProps<{
  absService: ABSService,
  progressMap?: Map<string, ABSProgress>
}>();

const emit = defineEmits<{
  (e: 'select-item', item: ABSLibraryItem): void,
  (e: 'click-info', item: ABSLibraryItem): void
}>();

const downloads = ref<ABSLibraryItem[]>([]);
const wishlist = ref<ABSLibraryItem[]>([]);
const isLoading = ref(true);
const storageUsage = ref(0);

const loadData = async () => {
  isLoading.value = true;
  downloads.value = await OfflineManager.getAllDownloadedBooks();
  wishlist.value = await OfflineManager.getWishlistBooks();
  storageUsage.value = await OfflineManager.getStorageUsage();
  isLoading.value = false;
};

// Hydrate items with real-time progress from App.vue
const hydrate = (list: ABSLibraryItem[]) => {
  if (!props.progressMap) return list;
  return list.map(item => {
    const live = props.progressMap!.get(item.id);
    return live ? { ...item, userProgress: live } : item;
  });
};

const hydratedDownloads = computed(() => hydrate(downloads.value));
const hydratedWishlist = computed(() => hydrate(wishlist.value));

const formattedStorage = computed(() => {
  if (storageUsage.value === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(storageUsage.value) / Math.log(k));
  return parseFloat((storageUsage.value / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

// Helper to get download progress for a specific item
const getDownloadProgress = (itemId: string) => {
  const status = downloadQueue.get(itemId);
  return status ? status.progress : undefined;
};

const handleDelete = async (e: Event, item: ABSLibraryItem) => {
  e.stopPropagation();
  if (confirm(`Remove download for "${item.media.metadata.title}"?`)) {
    await OfflineManager.deleteBook(item.id);
    await loadData();
  }
};

const handleRemoveWishlist = async (e: Event, item: ABSLibraryItem) => {
  e.stopPropagation();
  await OfflineManager.toggleWishlist(item); // Toggles off
  await loadData();
};

const handleSelect = (item: ABSLibraryItem) => {
  emit('select-item', item);
};

const handleInfo = (item: ABSLibraryItem) => {
  emit('click-info', item);
};

onMounted(loadData);
onActivated(loadData);
</script>

<template>
  <div class="h-full bg-[#0d0d0d] overflow-y-auto custom-scrollbar pb-40">
    <div class="pt-8 px-4 space-y-12 max-w-7xl mx-auto">
      
      <!-- Section 1: Local Downloads -->
      <section>
        <div class="flex items-center justify-between mb-6 px-1">
          <div class="flex items-center gap-3">
            <Download :size="16" class="text-purple-500" />
            <h2 class="text-lg font-black uppercase tracking-widest text-white">Local Storage</h2>
          </div>
          <div v-if="storageUsage > 0" class="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
            <HardDrive :size="12" class="text-neutral-500" />
            <span class="text-[10px] font-mono font-bold text-neutral-300">{{ formattedStorage }}</span>
          </div>
        </div>

        <div v-if="hydratedDownloads.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          <div v-for="item in hydratedDownloads" :key="item.id" class="flex flex-col gap-3 group">
            <BookCard 
              :item="item" 
              :coverUrl="absService.getCoverUrl(item.id)" 
              show-metadata
              show-progress 
              :download-progress="getDownloadProgress(item.id)"
              @click="handleSelect" 
              @click-info="handleInfo"
            />
            <!-- Delete Button (Moved Below Metadata) -->
            <button 
              @click="(e) => handleDelete(e, item)"
              class="w-full py-2 flex items-center justify-center gap-2 bg-neutral-900 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-all group/btn"
              title="Remove Download"
            >
              <Trash2 :size="12" class="group-hover/btn:scale-110 transition-transform" />
              <span class="text-[9px] font-black uppercase tracking-widest">Delete Data</span>
            </button>
          </div>
        </div>

        <div v-else class="flex flex-col items-center justify-center py-10 border border-dashed border-white/5 rounded-2xl">
           <p class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600">No local books found. Download a book to listen offline</p>
        </div>
      </section>

      <!-- Section 2: Want to Listen -->
      <section>
        <div class="flex items-center gap-3 mb-6 px-1">
          <Heart :size="16" class="text-pink-500" />
          <h2 class="text-lg font-black uppercase tracking-widest text-white">Want to Listen</h2>
        </div>

        <div v-if="hydratedWishlist.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
           <div v-for="item in hydratedWishlist" :key="item.id" class="flex flex-col gap-3 group">
             <BookCard 
               :item="item" 
               :coverUrl="absService.getCoverUrl(item.id)" 
               show-metadata 
               :download-progress="getDownloadProgress(item.id)"
               @click="handleSelect"
               @click-info="handleInfo" 
             />
             <!-- Remove Button -->
             <button 
                @click="(e) => handleRemoveWishlist(e, item)"
                class="w-full py-2 flex items-center justify-center gap-2 bg-neutral-900 border border-white/10 rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white transition-all group/btn"
                title="Remove from Wishlist"
             >
                <X :size="12" class="group-hover/btn:scale-110 transition-transform" />
                <span class="text-[9px] font-black uppercase tracking-widest">Remove</span>
             </button>
           </div>
        </div>

        <div v-else class="flex flex-col items-center justify-center py-20 text-center opacity-40">
           <PackageOpen :size="48" class="mb-4 text-neutral-700" />
           <p class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500">Wishlist Empty</p>
        </div>
      </section>

    </div>
  </div>
</template>
