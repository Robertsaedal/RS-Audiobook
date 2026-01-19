
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { AuthState, ABSLibraryItem, ABSSeries } from '../types';
import { ABSService } from '../services/absService';
import LibraryLayout, { LibraryTab } from './LibraryLayout.vue';
import Bookshelf from './Bookshelf.vue';
import SeriesShelf from './SeriesShelf.vue';
import SeriesView from './SeriesView.vue';
import RequestPortal from './RequestPortal.vue';
import { ArrowUpDown, Check } from 'lucide-vue-next';

const props = defineProps<{
  auth: AuthState,
  isStreaming?: boolean
}>();

const emit = defineEmits<{
  (e: 'select-item', item: ABSLibraryItem): void
  (e: 'logout'): void
}>();

const absService = new ABSService(props.auth.serverUrl, props.auth.user?.token || '');

const activeTab = ref<LibraryTab>('HOME');
const searchTerm = ref('');
const sortMethod = ref('addedAt'); // Enforce correct API sort key for 'Recently Added'
const desc = ref(1);
const showSortMenu = ref(false);
const selectedSeries = ref<ABSSeries | null>(null);
const isScanning = ref(false);
const selectedCount = ref(0);

const resumeHero = ref<ABSLibraryItem | null>(null);

const fetchResume = async () => {
  try {
    const { results } = await absService.getLibraryItemsPaged({ limit: 10, sort: 'lastUpdate', desc: 1 });
    resumeHero.value = results.find(i => i.userProgress && !i.userProgress.isFinished && i.userProgress.progress > 0) || null;
  } catch (e) {
    console.error("Failed to fetch resume item");
  }
};

onMounted(() => {
  fetchResume();
});

onUnmounted(() => {
  absService.disconnect();
});

const handleSeriesSelect = (series: ABSSeries) => {
  selectedSeries.value = series;
};

const sortOptions = [
  { value: 'addedAt', label: 'Recently Added' },
  { value: 'lastUpdate', label: 'Recent Activity' },
  { value: 'media.metadata.title', label: 'By Title' },
  { value: 'media.metadata.authorName', label: 'By Author' },
] as const;

const handleTabChange = (tab: LibraryTab) => {
  activeTab.value = tab;
  selectedSeries.value = null;
  if (tab === 'HOME') {
    sortMethod.value = 'addedAt';
    desc.value = 1;
  }
};

const handleScan = async () => {
  if (isScanning.value) return;
  isScanning.value = true;
  try {
    await absService.scanLibrary();
  } catch (e) {
    console.error("Scan failed", e);
  } finally {
    setTimeout(() => { isScanning.value = false; }, 5000);
  }
};

absService.onProgressUpdate((updated) => {
  if (resumeHero.value?.id === updated.itemId) {
    resumeHero.value = { ...resumeHero.value, userProgress: updated };
  }
});
</script>

<template>
  <LibraryLayout 
    :activeTab="activeTab" 
    v-model:search="searchTerm"
    :isScanning="isScanning"
    :isStreaming="isStreaming"
    :username="auth.user?.username"
    :selectedCount="selectedCount"
    @tab-change="handleTabChange" 
    @logout="emit('logout')"
    @scan="handleScan"
    @clear-selection="selectedCount = 0"
  >
    <!-- Local Header (Refined for Dashboard/Library meta) -->
    <header v-if="activeTab !== 'REQUEST' && !selectedSeries" class="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 animate-fade-in">
      <div class="space-y-1">
        <h2 class="text-3xl font-black uppercase tracking-tighter text-white">
          {{ activeTab === 'HOME' ? 'Dashboard' : activeTab }}
        </h2>
        <p class="text-[9px] font-black uppercase tracking-[0.4em] text-neutral-600">
          Archives Sector {{ activeTab }}
        </p>
      </div>

      <div class="flex items-center gap-4">
        <!-- Sort Menu -->
        <div class="relative">
          <button 
            @click="showSortMenu = !showSortMenu"
            class="p-2.5 rounded-md border border-white/5 bg-[#1a1a1a] text-neutral-500 hover:text-white transition-all active:scale-95 flex items-center gap-2"
            :class="{ 'text-purple-400 border-purple-500/20': showSortMenu }"
          >
            <ArrowUpDown :size="16" />
            <span class="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Sort Order</span>
          </button>
          
          <Transition name="fade-pop">
            <div v-if="showSortMenu" class="absolute right-0 top-full mt-2 w-48 bg-[#1a1a1a] border border-white/10 rounded-lg p-1 shadow-2xl z-[70] backdrop-blur-xl">
              <button
                v-for="opt in sortOptions"
                :key="opt.value"
                @click="sortMethod = opt.value; showSortMenu = false;"
                class="w-full flex items-center justify-between px-4 py-3 rounded text-[10px] font-bold uppercase tracking-widest transition-all"
                :class="sortMethod === opt.value ? 'bg-purple-600/20 text-white' : 'text-neutral-500 hover:text-neutral-300'"
              >
                {{ opt.label }}
                <Check v-if="sortMethod === opt.value" :size="12" class="text-purple-500" />
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </header>

    <!-- Main View Switcher -->
    <div class="flex-1 min-h-0">
      <!-- Search results override normal view -->
      <div v-if="searchTerm && !selectedSeries" class="h-full">
        <Bookshelf 
          :absService="absService" 
          :sortMethod="sortMethod" 
          :desc="desc" 
          :search="searchTerm"
          :isStreaming="isStreaming"
          @select-item="emit('select-item', $event)"
        />
      </div>

      <SeriesView 
        v-else-if="selectedSeries"
        :series="selectedSeries"
        :absService="absService"
        @back="selectedSeries = null"
        @select-item="emit('select-item', $event)"
      />

      <template v-else>
        <!-- HOME TAB -->
        <div v-if="activeTab === 'HOME'" class="space-y-12 h-full overflow-y-auto no-scrollbar">
          <!-- Continue Reading -->
          <section v-if="resumeHero" class="space-y-6">
             <h3 class="text-[10px] font-bold uppercase tracking-[0.5em] text-neutral-700">Continue Listening</h3>
            <div class="relative group w-full aspect-[21/9] bg-[#1a1a1a] rounded-2xl overflow-hidden border border-white/5 cursor-pointer shadow-2xl transition-all hover:border-purple-500/20" @click="emit('select-item', resumeHero!)">
              <img :src="absService.getCoverUrl(resumeHero.id)" class="w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity" />
              <div class="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-8 flex flex-col justify-end">
                <h4 class="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white mb-1 leading-none">{{ resumeHero.media.metadata.title }}</h4>
                <p class="text-[10px] font-black text-purple-400 uppercase tracking-[0.3em] mb-6">
                  {{ resumeHero.media.metadata.authorName }}
                </p>
                <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                  <div class="h-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" :style="{ width: `${(resumeHero.userProgress?.progress || 0) * 100}%` }" />
                </div>
              </div>
            </div>
          </section>

          <!-- Dashboard Shelf (Recently Added) -->
          <section class="h-full">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.5em] text-neutral-700 mb-6">Recently Added</h3>
            <Bookshelf 
              :absService="absService" 
              :sortMethod="'addedAt'" 
              :desc="1"
              :isStreaming="isStreaming"
              @select-item="emit('select-item', $event)"
            />
          </section>
        </div>

        <div v-else-if="activeTab === 'LIBRARY'" class="h-full">
          <Bookshelf 
            :absService="absService" 
            :sortMethod="sortMethod" 
            :desc="desc"
            :isStreaming="isStreaming"
            @select-item="emit('select-item', $event)"
          />
        </div>

        <div v-else-if="activeTab === 'SERIES'" class="h-full">
          <SeriesShelf 
            :absService="absService" 
            :sortMethod="sortMethod" 
            :desc="desc"
            @select-series="handleSeriesSelect"
          />
        </div>

        <div v-else-if="activeTab === 'REQUEST'" class="h-full animate-fade-in">
          <RequestPortal />
        </div>
      </template>
    </div>
  </LibraryLayout>
</template>

<style scoped>
.fade-pop-enter-active, .fade-pop-leave-active { transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
.fade-pop-enter-from { opacity: 0; transform: scale(0.95) translateY(10px); }
.fade-pop-leave-to { opacity: 0; transform: scale(1.05); }

.animate-fade-in {
  animation: fade-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
