
<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { ABSLibraryItem, ABSChapter, AuthState, ABSAudioFile } from '../types';
import { ABSService } from '../services/absService';
import { 
  X, Save, RotateCcw, LayoutPanelLeft, Clock, 
  Plus, Trash2, Lock, Unlock, ChevronUp, ChevronDown,
  AlertCircle, AlertTriangle, CheckCircle2, ListPlus
} from 'lucide-vue-next';

const props = defineProps<{
  item: ABSLibraryItem;
  auth: AuthState;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', updatedItem: ABSLibraryItem): void;
}>();

const absService = new ABSService(props.auth.serverUrl, props.auth.user?.token || '');
const newChapters = ref<ABSChapter[]>([]);
const lockedChapters = ref(new Set<number>());
const isSaving = ref(false);
const hasChanges = ref(false);
const showShiftTimes = ref(false);
const shiftAmount = ref(0);

// i18n placeholders (Simplified)
const strings = {
  header: 'Archive Index Editor',
  start: 'Start',
  title: 'Chapter Title',
  save: 'Save Changes',
  reset: 'Reset',
  shift: 'Shift Times',
  setFromTracks: 'Set From Tracks',
  errorFirst: 'First chapter must start at 0:00',
  errorLtPrev: 'Start time must be after previous chapter',
  errorGteDur: 'Start time exceeds artifact duration',
  successSave: 'Registry updated successfully',
  failSave: 'Failed to synchronize chapters'
};

const mediaDuration = computed(() => props.item.media.duration || 0);

const initChapters = () => {
  const existing = props.item.media.chapters || [];
  newChapters.value = JSON.parse(JSON.stringify(existing)).map((c: any, i: number) => ({
    ...c,
    id: i // Ensure sequential internal IDs
  }));
  
  if (newChapters.value.length === 0) {
    newChapters.value = [{
      id: 0,
      start: 0,
      end: mediaDuration.value,
      title: 'Chapter 01'
    }];
  }
  lockedChapters.value.clear();
  checkChapters();
  hasChanges.value = false;
};

const checkChapters = () => {
  let previousStart = -0.001;
  let changesFound = newChapters.value.length !== (props.item.media.chapters?.length || 0);

  newChapters.value.forEach((ch, i) => {
    ch.id = i;
    ch.start = Number(ch.start);
    ch.title = (ch.title || '').trim();

    // Validation
    let error: string | null = null;
    if (i === 0 && ch.start !== 0) {
      error = strings.errorFirst;
    } else if (ch.start <= previousStart && i > 0) {
      error = strings.errorLtPrev;
    } else if (ch.start >= mediaDuration.value) {
      error = strings.errorGteDur;
    }
    
    // Type casting/extending ABSChapter to include error for local UI
    (ch as any).error = error;
    previousStart = ch.start;

    if (!changesFound) {
      const orig = props.item.media.chapters?.[i];
      if (!orig || ch.start !== orig.start || ch.title !== orig.title) {
        changesFound = true;
      }
    }
  });

  hasChanges.value = changesFound;
};

const setChaptersFromTracks = () => {
  const audioFiles = props.item.media.audioFiles || [];
  if (audioFiles.length === 0) return;

  let currentStart = 0;
  const tracksAsChapters: ABSChapter[] = audioFiles
    .filter(f => !f.metadata?.exclude)
    .map((f, i) => {
      const fileName = f.metadata?.filename || `Track ${i + 1}`;
      // Basic title from filename
      const title = fileName.split('/').pop()?.split('.').shift() || fileName;
      const ch = {
        id: i,
        start: currentStart,
        end: currentStart + (f.duration || 0),
        title: title
      };
      currentStart += (f.duration || 0);
      return ch;
    });

  newChapters.value = tracksAsChapters;
  lockedChapters.value.clear();
  checkChapters();
};

const shiftChapterTimes = () => {
  const amount = Number(shiftAmount.value);
  if (!amount || newChapters.value.length <= 1) return;

  newChapters.value.forEach((ch, i) => {
    if (lockedChapters.value.has(ch.id)) return;
    
    // Don't shift Chapter 1's start if it's 0
    if (i === 0) {
      ch.start = Math.max(0, ch.start + amount);
    } else {
      ch.start = Math.max(0, Math.min(ch.start + amount, mediaDuration.value));
    }
  });
  
  checkChapters();
};

const toggleLock = (id: number) => {
  if (lockedChapters.value.has(id)) {
    lockedChapters.value.delete(id);
  } else {
    lockedChapters.value.add(id);
  }
};

const addChapterAfter = (idx: number) => {
  const current = newChapters.value[idx];
  const next = newChapters.value[idx + 1];
  
  const newStart = next 
    ? (current.start + next.start) / 2 
    : Math.min(current.start + 300, mediaDuration.value);

  const newCh: ABSChapter = {
    id: 0,
    start: Number(newStart.toFixed(3)),
    end: next ? next.start : mediaDuration.value,
    title: ''
  };

  newChapters.value.splice(idx + 1, 0, newCh);
  checkChapters();
};

const removeChapter = (idx: number) => {
  if (newChapters.value.length <= 1) return;
  newChapters.value.splice(idx, 1);
  checkChapters();
};

const saveChapters = async () => {
  if (newChapters.value.some(ch => (ch as any).error)) return;

  isSaving.value = true;
  try {
    const payload = newChapters.value.map((ch, i) => {
      const next = newChapters.value[i + 1];
      return {
        ...ch,
        end: next ? next.start : mediaDuration.value
      };
    });

    const url = `${props.auth.serverUrl}/api/items/${props.item.id}/chapters`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${props.auth.user?.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ chapters: payload })
    });

    if (!response.ok) throw new Error(strings.failSave);
    
    const updatedRes = await fetch(`${props.auth.serverUrl}/api/items/${props.item.id}?expanded=1`, {
      headers: { 'Authorization': `Bearer ${props.auth.user?.token}` }
    });
    const updatedItem = await updatedRes.json();
    
    emit('saved', updatedItem);
    emit('close');
  } catch (e: any) {
    console.error(e);
    alert(e.message);
  } finally {
    isSaving.value = false;
  }
};

const secondsToTimestamp = (s: number) => {
  if (isNaN(s) || s < 0) return "00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${sec.toString().padStart(2, '0')}`;
};

onMounted(initChapters);

watch(newChapters, () => checkChapters(), { deep: true });
</script>

<template>
  <div class="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex flex-col overflow-hidden animate-fade-in">
    <!-- Header -->
    <header class="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-[#0a0a0a]/50 shrink-0">
      <div class="flex items-center gap-6">
        <button @click="emit('close')" class="p-2.5 bg-neutral-900 rounded-full text-neutral-500 hover:text-white transition-all active:scale-90">
          <X :size="20" />
        </button>
        <div class="space-y-0.5">
          <h2 class="text-lg font-black uppercase tracking-tighter text-white">{{ strings.header }}</h2>
          <p class="text-[8px] font-black uppercase tracking-[0.4em] text-purple-600">{{ item.media.metadata.title }}</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <button 
          v-if="hasChanges"
          @click="initChapters"
          class="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 rounded-full text-[10px] font-black uppercase tracking-widest text-neutral-400 transition-all active:scale-95"
        >
          <RotateCcw :size="14" />
          <span>{{ strings.reset }}</span>
        </button>

        <button 
          @click="saveChapters"
          :disabled="!hasChanges || isSaving"
          class="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:grayscale rounded-full text-[10px] font-black uppercase tracking-widest text-white transition-all active:scale-95 shadow-[0_0_20px_rgba(168,85,247,0.3)]"
        >
          <Save v-if="!isSaving" :size="14" />
          <div v-else class="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <span>{{ strings.save }}</span>
        </button>
      </div>
    </header>

    <!-- Toolbar -->
    <div class="bg-neutral-900/40 px-8 py-4 border-b border-white/5 flex items-center gap-6 overflow-x-auto no-scrollbar">
      <button 
        @click="setChaptersFromTracks"
        class="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-white transition-all shrink-0"
      >
        <LayoutPanelLeft :size="14" />
        <span>{{ strings.setFromTracks }}</span>
      </button>

      <div class="h-4 w-px bg-white/10 shrink-0" />

      <div class="flex items-center gap-3 shrink-0">
        <button 
          @click="showShiftTimes = !showShiftTimes"
          class="flex items-center gap-2 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all"
          :class="showShiftTimes ? 'bg-purple-600/10 text-purple-400 border border-purple-500/20' : 'bg-neutral-900 border border-white/5 text-neutral-400'"
        >
          <Clock :size="14" />
          <span>{{ strings.shift }}</span>
        </button>
        
        <Transition name="fade">
          <div v-if="showShiftTimes" class="flex items-center gap-2 animate-fade-in">
            <input 
              v-model="shiftAmount" 
              type="number" 
              class="w-20 bg-black border border-white/10 rounded-lg py-1.5 px-3 text-[10px] font-black font-mono text-purple-400 outline-none focus:border-purple-500" 
            />
            <button @click="shiftChapterTimes" class="p-2 bg-purple-600 rounded-lg text-white active:scale-90 transition-all">
              <CheckCircle2 :size="14" />
            </button>
          </div>
        </Transition>
      </div>

      <div class="flex-1" />
      
      <div class="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-neutral-600 shrink-0">
        <div class="flex items-center gap-2">
          <Clock :size="12" />
          <span>Duration: {{ secondsToTimestamp(mediaDuration) }}</span>
        </div>
        <div class="flex items-center gap-2">
          <ListPlus :size="12" />
          <span>{{ newChapters.length }} Segments</span>
        </div>
      </div>
    </div>

    <!-- Main Editor List -->
    <div class="flex-1 overflow-y-auto p-8 custom-scrollbar pb-32">
      <div class="max-w-4xl mx-auto space-y-2">
        <div class="grid grid-cols-[60px_140px_1fr_140px] gap-4 px-6 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-700">
          <span>#</span>
          <span>{{ strings.start }}</span>
          <span>{{ strings.title }}</span>
          <span class="text-right">Actions</span>
        </div>

        <TransitionGroup name="list">
          <div 
            v-for="(ch, i) in newChapters" 
            :key="i"
            class="grid grid-cols-[60px_140px_1fr_140px] gap-4 p-2 px-4 rounded-2xl border transition-all duration-300 items-center"
            :class="[
              (ch as any).error ? 'bg-red-500/5 border-red-500/20' : 'bg-neutral-900/30 border-white/5 hover:bg-neutral-900/50',
              lockedChapters.has(ch.id) ? 'opacity-50 grayscale-[0.5]' : ''
            ]"
          >
            <span class="text-[10px] font-black text-neutral-600 ml-2">#{{ (i + 1).toString().padStart(2, '0') }}</span>
            
            <div class="relative group">
              <input 
                v-model="ch.start"
                type="number"
                step="0.001"
                class="w-full bg-black border border-white/10 rounded-xl py-2.5 px-4 text-[11px] font-black font-mono text-white outline-none focus:border-purple-500/50 transition-all"
                @input="checkChapters"
              />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-black text-neutral-700 group-focus-within:text-purple-500 transition-colors">SEC</span>
            </div>

            <div class="relative">
              <input 
                v-model="ch.title"
                type="text"
                placeholder="Segment name..."
                class="w-full bg-black border border-white/10 rounded-xl py-2.5 px-4 text-[11px] font-bold text-white outline-none focus:border-purple-500/50 transition-all placeholder:text-neutral-800"
                @input="checkChapters"
              />
              <div v-if="(ch as any).error" class="absolute left-1 -bottom-4 flex items-center gap-1 text-red-500 animate-fade-in">
                <AlertCircle :size="10" />
                <span class="text-[8px] font-black uppercase tracking-widest">{{ (ch as any).error }}</span>
              </div>
            </div>

            <div class="flex items-center justify-end gap-1">
              <button 
                @click="toggleLock(ch.id)"
                class="p-2.5 rounded-xl transition-all active:scale-90"
                :class="lockedChapters.has(ch.id) ? 'bg-purple-600/10 text-purple-400' : 'bg-neutral-900 text-neutral-600 hover:text-neutral-400'"
              >
                <Lock v-if="lockedChapters.has(ch.id)" :size="14" />
                <Unlock v-else :size="14" />
              </button>

              <button 
                @click="addChapterAfter(i)"
                class="p-2.5 bg-neutral-900 text-neutral-600 hover:text-green-500 rounded-xl transition-all active:scale-90"
              >
                <Plus :size="14" />
              </button>

              <button 
                @click="removeChapter(i)"
                :disabled="newChapters.length <= 1"
                class="p-2.5 bg-neutral-900 text-neutral-600 hover:text-red-500 disabled:opacity-0 rounded-xl transition-all active:scale-90"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
        </TransitionGroup>

        <div class="py-20 flex flex-col items-center gap-4 opacity-20">
          <div class="h-10 w-px bg-gradient-to-b from-white to-transparent" />
          <p class="text-[8px] font-black uppercase tracking-[0.6em]">End of Index</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.animate-fade-in {
  animation: fade-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.list-enter-active, .list-leave-active { transition: all 0.4s ease; }
.list-enter-from { opacity: 0; transform: translateX(-20px); }
.list-leave-to { opacity: 0; transform: translateX(20px); }
</style>
