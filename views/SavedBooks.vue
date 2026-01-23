
<script setup lang="ts">
import { ref, onMounted, onActivated } from 'vue';
import { ABSLibraryItem } from '../types';
import { OfflineManager } from '../services/offlineManager';
import { ABSService } from '../services/absService';
import BookCard from '../components/BookCard.vue';
import { Trash2, PackageOpen, Download, Heart } from 'lucide-vue-next';

const props = defineProps<{
  absService: ABSService
}>();

const emit = defineEmits<{
  (e: 'select-item', item: ABSLibraryItem): void,
  (e: 'click-info', item: ABSLibraryItem): void
}>();

const downloads = ref<ABSLibraryItem[]>([]);
const wishlist = ref<ABSLibraryItem[]>([]);
const isLoading = ref(true);

const loadData = async () => {
  isLoading.value = true;
  downloads.value = await OfflineManager.getAllDownloadedBooks();
  wishlist.value = await OfflineManager.getWishlistBooks();
  isLoading.value = false;
};

const handleDelete = async (e: Event, item: ABSLibraryItem) => {
  e.stopPropagation();
  if (confirm(`Remove download for "${item.media.metadata.title}"?`)) {
    await OfflineManager.deleteBook(item.id);
    await loadData();
  }
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
    <div class="pt-8 px-2 space-y-12">
      
      <!-- Section 1: Local Downloads -->
      <section>
        <div class="flex items-center gap-3 mb-6 px-2">
          <Download :size="16" class="text-purple-500" />
          <h2 class="text-lg font-black uppercase tracking-widest text-white">Local Storage</h2>
        </div>

        <div v-if="downloads.length > 0" class="flex gap-8 overflow-x-auto no-scrollbar pb-8 px-2">
          <div v-for="item in downloads" :key="item.id" class="w-32 md:w-40 shrink-0 relative group">
            <BookCard 
              :item="item" 
              :coverUrl="absService.getCoverUrl(item.id)" 
              show-metadata 
              @click="handleSelect" 
              @click-info="handleInfo"
            />
            <!-- Delete Button (Top Left overlay) -->
            <button 
              @click="(e) => handleDelete(e, item)"
              class="absolute top-2 left-2 z-50 p-2 bg-red-500/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-xl"
              title="Remove Download"
            >
              <Trash2 :size="12" />
            </button>
          </div>
        </div>

        <div v-else class="flex flex-col items-center justify-center py-10 border border-dashed border-white/5 rounded-2xl mx-2">
           <p class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600">No downloaded artifacts</p>
        </div>
      </section>

      <!-- Section 2: Want to Listen -->
      <section>
        <div class="flex items-center gap-3 mb-6 px-2">
          <Heart :size="16" class="text-pink-500" />
          <h2 class="text-lg font-black uppercase tracking-widest text-white">Want to Listen</h2>
        </div>

        <div v-if="wishlist.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 px-2">
           <BookCard 
             v-for="item in wishlist" 
             :key="item.id" 
             :item="item" 
             :coverUrl="absService.getCoverUrl(item.id)" 
             show-metadata 
             @click="handleSelect"
             @click-info="handleInfo" 
           />
        </div>

        <div v-else class="flex flex-col items-center justify-center py-20 text-center opacity-40">
           <PackageOpen :size="48" class="mb-4 text-neutral-700" />
           <p class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500">Wishlist Empty</p>
        </div>
      </section>

    </div>
  </div>
</template>
