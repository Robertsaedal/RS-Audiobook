
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { AuthState, ABSLibraryItem, ABSChapter } from '../types';
import { ABSService } from '../services/absService';
import Hls from 'hls.js';
import { 
  ChevronDown, Play, Pause, Info, X, Activity, Plus, Minus, 
  AlertCircle, RotateCcw, RotateCw, List, Timer
} from 'lucide-vue-next';

const props = defineProps<{
  auth: AuthState,
  item: ABSLibraryItem
}>();

const emit = defineEmits<{
  (e: 'back'): void
}>();

const audioRef = ref<HTMLAudioElement | null>(null);
const hlsInstance = ref<Hls | null>(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(props.item.media.duration || 0);
const chapters = ref<ABSChapter[]>([]);
const playbackSpeed = ref(1.0);
const sleepSeconds = ref(0);
const isLoading = ref(true);
const seekLoading = ref(false);
const error = ref<string | null>(null);
const bufferPercent = ref(0);

const showChapters = ref(false);
const showInfo = ref(false);

const absService = new ABSService(props.auth.serverUrl, props.auth.user?.token || '');
const coverUrl = computed(() => absService.getCoverUrl(props.item.id));

const currentChapterIndex = computed(() => {
  if (!chapters.value.length) return -1;
  return chapters.value.findIndex((ch, i) => 
    currentTime.value >= ch.start && (i === chapters.value.length - 1 || currentTime.value < (chapters.value[i+1]?.start || ch.end))
  );
});

const currentChapter = computed(() => currentChapterIndex.value !== -1 ? chapters.value[currentChapterIndex.value] : null);
const timeRemaining = computed(() => Math.max(0, duration.value - currentTime.value));
const progressPercent = computed(() => duration.value ? (currentTime.value / duration.value) * 100 : 0);

const secondsToTimestamp = (s: number) => {
  if (isNaN(s) || s < 0) return "00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${sec.toString().padStart(2, '0')}`;
};

const togglePlay = async () => {
  if (!audioRef.value || isLoading.value) return;
  audioRef.value.paused ? await audioRef.value.play() : audioRef.value.pause();
};

const seek = (time: number) => {
  if (!audioRef.value || isLoading.value) return;
  const target = Math.max(0, Math.min(time, duration.value));
  audioRef.value.currentTime = target;
  currentTime.value = target;
};

const saveProgress = () => {
  if (audioRef.value && audioRef.value.currentTime > 0) {
    absService.saveProgress(props.item.id, audioRef.value.currentTime, duration.value);
  }
};

onMounted(async () => {
  try {
    const details = await absService.getItemDetails(props.item.id);
    chapters.value = details.media.chapters || [];
    duration.value = details.media.duration || props.item.media.duration || 0;
    
    const progress = details.userProgress || await absService.getProgress(props.item.id);
    const startAt = progress?.currentTime || 0;

    await nextTick();
    const audio = audioRef.value;
    if (audio) {
      audio.crossOrigin = 'anonymous';
      const hlsUrl = absService.getHlsStreamUrl(props.item.id);

      if (Hls.isSupported()) {
        const hls = new Hls({ 
          startPosition: startAt,
          xhrSetup: (xhr) => {
            xhr.withCredentials = true;
            xhr.setRequestHeader('Authorization', `Bearer ${props.auth.user?.token}`);
          }
        });
        hlsInstance.value = hls;
        hls.attachMedia(audio);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(hlsUrl));
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          isLoading.value = false;
        });
        hls.on(Hls.Events.BUFFER_APPENDED, () => {
          if (audio.buffered.length) bufferPercent.value = (audio.buffered.end(audio.buffered.length - 1) / duration.value) * 100;
        });
      } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        audio.src = hlsUrl;
        audio.addEventListener('canplay', () => {
          audio.currentTime = startAt;
          isLoading.value = false;
        }, { once: true });
      }
    }
  } catch (e: any) {
    error.value = e.message || "Archive Link Severed";
  }
  setInterval(saveProgress, 10000);
});

onUnmounted(() => {
  saveProgress();
  if (hlsInstance.value) hlsInstance.value.destroy();
});

watch(playbackSpeed, (val) => { if (audioRef.value) audioRef.value.playbackRate = val; });
</script>

<template>
  <div class="h-[100dvh] w-full bg-black text-white flex flex-col relative overflow-hidden font-sans select-none safe-top safe-bottom">
    <audio ref="audioRef" @timeupdate="(e: any) => currentTime = e.target.currentTime" @play="isPlaying = true" @pause="isPlaying = false" crossorigin="anonymous" />

    <!-- Header -->
    <header class="px-8 pt-8 pb-4 flex justify-between items-center z-20 shrink-0">
      <button @click="emit('back')" class="bg-neutral-900/40 p-3 rounded-2xl border border-white/5 active:scale-90 transition-all">
        <X :size="20" class="text-neutral-500" />
      </button>
      <button @click="showChapters = true" class="flex items-center gap-3 bg-neutral-900/60 pl-5 pr-4 py-2.5 rounded-full border border-white/5 active:scale-95 transition-all max-w-[60%]">
        <span class="text-[10px] font-black uppercase tracking-widest text-purple-500 truncate">{{ currentChapter?.title || 'Index' }}</span>
        <List :size="16" class="text-purple-500 shrink-0" />
      </button>
      <button @click="showInfo = true" class="bg-neutral-900/40 p-3 rounded-2xl border border-white/5 active:scale-90 transition-all">
        <Info :size="20" class="text-neutral-500" />
      </button>
    </header>

    <!-- Content -->
    <div class="flex-1 flex flex-col items-center justify-center px-8 relative">
      <div class="relative w-full max-w-[320px] aspect-square">
        <div class="absolute -inset-10 bg-purple-600/10 blur-[100px] rounded-full" />
        <img :src="coverUrl" class="w-full h-full object-cover rounded-[56px] shadow-2xl border border-white/10 relative z-10" />
      </div>
      <div class="mt-10 text-center space-y-2">
        <h1 class="text-2xl font-black uppercase tracking-tighter">{{ item.media.metadata.title }}</h1>
        <p class="text-neutral-500 text-[10px] font-black uppercase tracking-[0.4em]">{{ item.media.metadata.authorName }}</p>
      </div>
    </div>

    <!-- Controls -->
    <footer class="px-8 pb-10 space-y-8 max-w-xl mx-auto w-full">
      <div class="space-y-4">
        <div class="flex justify-between text-[10px] font-black font-mono text-neutral-500">
          <span>{{ secondsToTimestamp(currentTime) }}</span>
          <span class="text-purple-500">-{{ secondsToTimestamp(timeRemaining) }}</span>
        </div>
        <div class="h-1.5 w-full bg-neutral-900 rounded-full relative cursor-pointer overflow-hidden" @click="(e: any) => seek((e.offsetX / e.currentTarget.clientWidth) * duration)">
          <div class="absolute inset-y-0 left-0 bg-neutral-800 transition-all" :style="{ width: bufferPercent + '%' }" />
          <div class="absolute inset-y-0 left-0 gradient-aether shadow-aether-glow transition-all" :style="{ width: progressPercent + '%' }" />
        </div>
      </div>

      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3 bg-neutral-900/40 p-2 rounded-2xl border border-white/5">
          <button @click="playbackSpeed = Math.max(0.5, playbackSpeed - 0.1)" class="p-2 text-neutral-500"><Minus :size="14" /></button>
          <span class="text-[10px] font-black font-mono text-purple-500 w-8 text-center">{{ playbackSpeed.toFixed(1) }}x</span>
          <button @click="playbackSpeed = Math.min(2.5, playbackSpeed + 0.1)" class="p-2 text-neutral-500"><Plus :size="14" /></button>
        </div>

        <div class="flex items-center gap-6">
          <button @click="seek(currentTime - 15)" class="text-neutral-500 active:scale-90"><RotateCcw :size="24" /></button>
          <button @click="togglePlay" class="w-20 h-20 rounded-full gradient-aether flex items-center justify-center shadow-aether-glow active:scale-95 transition-all">
            <Pause v-if="isPlaying" :size="32" class="text-white fill-current" />
            <Play v-else :size="32" class="text-white fill-current translate-x-1" />
          </button>
          <button @click="seek(currentTime + 30)" class="text-neutral-500 active:scale-90"><RotateCw :size="24" /></button>
        </div>

        <div class="flex items-center gap-2 bg-neutral-900/40 p-3 rounded-2xl border border-white/5 text-neutral-500">
          <Timer :size="18" />
          <span class="text-[10px] font-black uppercase">Off</span>
        </div>
      </div>
    </footer>
  </div>
</template>
