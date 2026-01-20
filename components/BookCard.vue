<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Play, CheckCircle, Check } from 'lucide-vue-next';
import { OfflineManager } from '../services/offlineManager';

const props = defineProps<{
  item: any, // Using any to bypass strict type check for debugging
  coverUrl: string,
  isSelected?: boolean,
  showMetadata?: boolean,
  fallbackSequence?: number | string,
  showProgress?: boolean
}>();

const emit = defineEmits(['click', 'finish']);

const imageReady = ref(false);
const isDownloaded = ref(false);
const localCover = ref<string | null>(null);

// 1. FIX: PROGRESS CALCULATION
const progress = computed(() => {
  // Personalized endpoints usually nest progress here
  const p = props.item?.userProgress || props.item?.progress;
  
  if (!p) return 0;

  // ABS 'progress' is a float (0.1234)
  const rawProgress = p.progress ?? 0;
  
  // If progress is 0 but currentTime exists, they have started the book
  if (rawProgress === 0 && (p.currentTime > 0)) {
    const duration = props.item?.media?.duration || p.duration || 1;
    return Math.min(100, (p.currentTime / duration) * 100);
  }

  // Convert decimal to percentage
  return rawProgress <= 1 ? rawProgress * 100 : rawProgress;
});

// 2. FIX: FINISHED CHECKMARK
const isFinished = computed(() => {
  const p = props.item?.userProgress || props.item?.progress;
  // ABS uses isFinished (bool) or checks if progress is 1
  return p?.isFinished === true || p?.isFinished === 1 || progress.value >= 100;
});

// 3. FIX: SERIES SEQUENCE (#1.5)
const displaySequence = computed(() => {
  // Check the series page logic first (fallbackSequence)
  if (props.fallbackSequence) return props.fallbackSequence;

  // Then check the metadata specifically for the sequence float
  const metadata = props.item?.media?.metadata || props.item?.metadata;
  const seq = metadata?.seriesSequence || props.item?.sequence;
  
  return (seq !== undefined && seq !== null) ? seq : null;
});

const handleImageLoad = () => { imageReady.value = true; };
const handleMarkFinished = (e: any) => {
  e.stopPropagation();
  emit('finish', props.item);
};

onMounted(async () => {
  if (await OfflineManager.isDownloaded(props.item.id)) {
    isDownloaded.value = true;
    localCover.value = await OfflineManager.getCoverUrl(props.item.id);
  }
});
</script>

<template>
  <button @click="emit('click', item)" class="flex flex-col text-left group w-full relative">
    <div class="relative w-full aspect-[2/3] bg-neutral-900 rounded-xl overflow-hidden border border-white/5 shadow-2xl">
      
      <img 
        :src="localCover || coverUrl" 
        @load="handleImageLoad"
        class="w-full h-full object-cover transition-all duration-700" 
        :class="{ 'opacity-0': !imageReady, 'grayscale opacity-40': isFinished }"
      />

      <div v-if="displaySequence" class="absolute top-2 right-2 bg-purple-600 px-2 py-0.5 rounded text-[10px] font-black text-white z-50">
        #{{ displaySequence }}
      </div>

      <div v-if="progress > 0 && !isFinished" class="absolute bottom-0 left-0 w-full h-1 bg-neutral-800 z-30">
        <div class="h-full bg-purple-500 shadow-[0_0_10px_#a855f7]" :style="{ width: progress + '%' }"></div>
      </div>

      <div v-if="isFinished" class="absolute inset-0 flex items-center justify-center z-40">
        <div class="bg-green-600 p-2 rounded-full shadow-lg transform rotate-12">
          <Check :size="20" class="text-white" stroke-width="4" />
        </div>
      </div>

    </div>
    
    <div v-if="showMetadata" class="mt-2">
      <h3 class="text-[11px] font-bold text-white uppercase truncate">{{ item.media?.metadata?.title || item.metadata?.title }}</h3>
      <p class="text-[9px] text-neutral-500 uppercase">{{ item.media?.metadata?.authorName || item.metadata?.authorName }}</p>
    </div>
  </button>
</template>
