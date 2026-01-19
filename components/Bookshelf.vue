
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { ABSLibraryItem, ABSProgress } from '../types';
import { ABSService, LibraryQueryParams } from '../services/absService';
import BookCard from './BookCard.vue';
import { Search, Info, PackageOpen } from 'lucide-vue-next';

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

const items = ref<ABSLibraryItem[]>([]);
const totalItems = ref(0);
const loading = ref(false);
const offset = ref(0);
const limit = 24;
const hasMore = ref(true);
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const fetchItems = async (reset = false) => {
  if (loading.value) return;
  if (reset) {
    offset.value = 0;
    items.value = [];
    hasMore.value = true;
  }
  
  if (!hasMore.value) return;

  loading.value = true;
  try {
    const params: LibraryQueryParams = {
      limit,
      offset: offset.value,
      sort: props.sortMethod.toLowerCase(),
      desc: props.desc,
      search: props.search
    };
    
    const { results, total } = await props.absService.getLibraryItemsPaged(params);
    
    items.value = [...items.value, ...results];
    totalItems.value = total;
    offset.value += limit;
    hasMore.value = items.value.length < total;
  } catch (e) {
    console.error("Failed to fetch library page", e);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchItems(true);

  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMore.value && !loading.value) {
      fetchItems();
    }
  }, { threshold: 0.1 });

  if (sentinel.value) observer.observe(sentinel.value);
  
  props.absService.onProgressUpdate((updated: ABSProgress) => {
    const index = items.value.findIndex(i => i.id === updated.itemId);
    if (index !== -1) {
      items.value[index] = { ...items.value[index], userProgress: updated };
    }
  });

  props.absService.onLibraryUpdate(() => fetchItems(true));
});

onUnmounted(() => {
  if (observer) observer.disconnect();
});

watch(() => [props.sortMethod, props.desc, props.search], () => {
  fetchItems(true);
}, { deep: true });

</script>

<template>
  <div class="space-y-12 pb-20" :class="{ 'pb-40': isStreaming }">
    <!-- Empty State -->
    <div v-if="!loading && items.length === 0" class="flex flex-col items-center justify-center py-32 text-center animate-fade-in">
      <div class="w-24 h-24 rounded-full bg-neutral-900 flex items-center justify-center border border-white/5 mb-8 shadow-2xl">
        <PackageOpen :size="40" class="text-neutral-700" />
      </div>
      <h3 class="text-2xl font-black uppercase tracking-tighter text-white mb-2">No Artifacts Found</h3>
      <p class="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-800">Your archive is currently vacant.</p>
    </div>

    <!-- Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-x-6 gap-y-10">
      <BookCard 
        v-for="item in items" 
        :key="item.id" 
        :item="item" 
        :coverUrl="absService.getCoverUrl(item.id)"
        @click="emit('select-item', item)"
        class="animate-fade-in"
      />
    </div>

    <!-- Sentinel for Infinite Scroll -->
    <div ref="sentinel" class="h-20 flex items-center justify-center">
      <div v-if="loading" class="w-8 h-8 border-2 border-purple-600/20 border-t-purple-600 rounded-full animate-spin" />
      <div v-else-if="!hasMore && items.length > 0" class="flex flex-col items-center gap-2 opacity-20">
        <div class="h-px w-12 bg-neutral-800" />
        <span class="text-[8px] font-black uppercase tracking-[0.5em]">EOF</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fade-in 0.5s ease forwards;
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
