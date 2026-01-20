<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue';
import { ABSLibraryItem, ABSChapter } from '../types';
import { 
  X, Play, Pause, Clock, ListMusic, ChevronRight 
} from 'lucide-vue-next';

const props = defineProps<{
  item: ABSLibraryItem;
  currentTime: number;
  isPlaying: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'seek', time: number): void;
}>();

const chapters = computed(() => {
  return props.item?.media?.chapters || [];
});

const mediaDuration = computed(() => props.item?.media?.duration || 0);

const currentChapterIndex = computed(() => {
  if (chapters.value.length === 0) return -1;
  const time = props.currentTime + 0.1;
  return chapters.value.findIndex((ch, i) => 
    time >= ch.start && (i === chapters.value.length - 1 || time < (chapters[i+1]?.start || ch.end))
  );
});

const activeRowRef = ref<HTMLElement | null>(null);

const secondsToTimestamp = (s: number) => {
  if (isNaN(s) || s < 0) return "00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${sec.toString().padStart(2, '0')}`;
};

const handleRowClick = (chapter: ABSChapter) => {
  emit('seek', chapter.start);
};

onMounted(async () => {
  await nextTick();
  if (activeRowRef.value) {
    activeRowRef.value.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
</script>

<template>
  <div class="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex flex-col overflow-hidden animate-fade-in">
    <!-- Header: Focused on Context -->
    <header class="h-24 border-b border-white/5 flex items-center justify-between px-8 bg-[#0a0a0a]/50 shrink-0">
      <div class="flex items-center gap-6">
        <button @click="emit('close')" class="p-3 bg-neutral-900 rounded-full text-neutral-500 hover:text-white transition-all active:scale-90 border border-white/5">
          <X :size="20" />
        </button>
        <div class="space-y-0.5">
          <h2 class="text-xl font-black uppercase tracking-tighter text-white">Archive Index</h2>
          <p class="text-[8px] font-black uppercase tracking-[0.4em] text-purple-600">{{ item?.media?.metadata?.title || 'Loading Metadata...' }}</p>
        </div>
      </div>

      <div class="hidden md:flex items-center gap-6 text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600">
        <div class="flex items-center gap-2">
          <Clock :size="14" />
          <span>{{ secondsToTimestamp(mediaDuration) }} Total</span>
        </div>
        <div class="flex items-center gap-2">
          <ListMusic :size="14" />
          <span>{{ chapters.length }} Segments</span>
        </div>
      </div>
    </header>

    <!-- Chapter Selection Table -->
    <div class="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar pb-32">
      <div class="max-w-4xl mx-auto">
        <!-- Table Header -->
        <div class="grid grid-cols-[50px_1fr_100px] gap-4 px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-700 border-b border-white/5 mb-4">
          <span>#</span>
          <span>Segment Title</span>
          <span class="text-right">Timestamp</span>
        </div>

        <div class="space-y-1">
          <button 
            v-for="(ch, i) in chapters" 
            :key="i"
            @click="handleRowClick(ch)"
            :ref="(el) => { if (currentChapterIndex === i) activeRowRef = el as HTMLElement }"
            class="w-full grid grid-cols-[50px_1fr_100px] gap-4 p-5 px-6 rounded-2xl transition-all duration-300 items-center text-left group"
            :class="[
              currentChapterIndex === i 
                ? 'bg-purple-600/10 border border-purple-500/20 text-white shadow-[inset_0_0_20px_rgba(168,85,247,0.05)]' 
                : 'bg-transparent border border-transparent hover:bg-white/5 text-neutral-400'
            ]"
          >
            <!-- Column 1: Index or Playing Icon -->
            <div class="flex items-center">
              <template v-if="currentChapterIndex === i && isPlaying">
                <Pause :size="16" class="text-purple-500 fill-current" />
              </template>
              <template v-else-if="currentChapterIndex === i">
                <Play :size="16" class="text-purple-500 fill-current" />
              </template>
              <span v-else class="text-[11px] font-black font-mono text-neutral-700 group-hover:text-neutral-500 transition-colors">
                {{ (i + 1).toString().padStart(2, '0') }}
              </span>
            </div>

            <!-- Column 2: Title -->
            <div class="flex items-center gap-3 overflow-hidden">
              <span 
                class="text-xs font-bold uppercase tracking-tight truncate transition-colors"
                :class="currentChapterIndex === i ? 'text-purple-400' : 'text-inherit group-hover:text-white'"
              >
                {{ ch.title || `Segment ${(i + 1).toString().padStart(2, '0')}` }}
              </span>
              <ChevronRight 
                v-if="currentChapterIndex === i"
                :size="12" 
                class="text-purple-500 shrink-0"
              />
            </div>

            <!-- Column 3: Start Time -->
            <div class="text-right">
              <span class="text-[10px] font-black font-mono tracking-tighter tabular-nums text-neutral-600 group-hover:text-neutral-400 transition-colors">
                {{ secondsToTimestamp(ch.start) }}
              </span>
            </div>
          </button>
        </div>

        <!-- Empty State -->
        <div v-if="chapters.length === 0" class="py-40 flex flex-col items-center justify-center text-center opacity-20">
          <ListMusic :size="48" class="mb-4" />
          <p class="text-[10px] font-black uppercase tracking-[0.4em]">No index data available for this artifact</p>
        </div>

        <!-- Footer Decoration -->
        <div class="py-20 flex flex-col items-center gap-4 opacity-10">
          <div class="h-12 w-px bg-gradient-to-b from-white to-transparent" />
          <p class="text-[8px] font-black uppercase tracking-[0.6em]">End of Archive Index</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fade-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(168, 85, 247, 0.1);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(168, 85, 247, 0.3);
}
</style>
