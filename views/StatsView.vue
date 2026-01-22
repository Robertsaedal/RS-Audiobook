
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ABSService } from '../services/absService';
import { ABSProgress } from '../types';
import { BarChart2, AlertCircle, PlayCircle, Trophy, ChevronLeft, ChevronRight, Clock, Calendar } from 'lucide-vue-next';

const props = defineProps<{
  absService: ABSService,
  progressMap?: Map<string, ABSProgress>
}>();

const isLoading = ref(false);
const error = ref<string | null>(null);
const stats = ref<{
  totalTime: number;
  days: Record<string, number>;
  recentSessions: any[];
} | null>(null);

const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);

// Calculate books finished in the selected year
const totalBooksFinished = computed(() => {
  if (props.progressMap && props.progressMap.size > 0) {
    let count = 0;
    for (const p of props.progressMap.values()) {
      // Only count if explicitly finished
      if (p.isFinished) {
        const finishedDate = new Date(p.lastUpdate);
        if (finishedDate.getFullYear() === selectedYear.value) {
           count++;
        }
      }
    }
    return count;
  }
  return 0;
});

// Filter days data by selected year - Using String Parsing to avoid Timezone shifts
const monthlyData = computed(() => {
  const months = new Array(12).fill(0);
  if (!stats.value?.days) return months;

  Object.entries(stats.value.days).forEach(([dateStr, seconds]) => {
    // Expected format: YYYY-MM-DD
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed (0=Jan)
      
      if (year === selectedYear.value && month >= 0 && month < 12) {
        months[month] += Number(seconds);
      }
    }
  });
  return months;
});

const totalListeningTime = computed(() => {
  if (!stats.value?.days) return 0;
  let total = 0;
  Object.entries(stats.value.days).forEach(([dateStr, seconds]) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      if (year === selectedYear.value) {
        total += Number(seconds);
      }
    }
  });
  return total;
});

const prettyTotalTime = computed(() => {
  const seconds = totalListeningTime.value;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return { h, m };
});

const activeDaysCount = computed(() => {
  if (!stats.value?.days) return 0;
  let count = 0;
  Object.entries(stats.value.days).forEach(([dateStr, seconds]) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      if (year === selectedYear.value && Number(seconds) > 0) {
         count++;
      }
    }
  });
  return count;
});

const maxMonthlyValue = computed(() => {
  const max = Math.max(...monthlyData.value);
  return max > 0 ? max : 1; // Prevent division by zero
});

const recentSessions = computed(() => {
    return stats.value?.recentSessions || [];
});

const fetchStats = async () => {
  if (!props.absService) return;
  isLoading.value = true;
  error.value = null;
  
  try {
    const data = await props.absService.getListeningStats();
    if (!data) throw new Error("No stats available.");
    stats.value = data;
  } catch (e: any) {
    console.error("Failed to fetch stats", e);
    error.value = e.message || "Could not retrieve analytical data.";
  } finally {
    isLoading.value = false;
  }
};

const changeYear = (delta: number) => {
  selectedYear.value += delta;
};

onMounted(() => {
  fetchStats();
});

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden animate-fade-in relative bg-[#0d0d0d] -mx-4 md:-mx-8">
    <div class="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-40">
      
      <!-- Header with Year Selector -->
      <div class="pt-8 pb-8 flex items-end justify-between">
        <div>
          <h1 class="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white mb-2">My Analytics</h1>
          <p class="text-[10px] font-black uppercase tracking-[0.4em] text-purple-500">Year in Review</p>
        </div>
        
        <div class="flex items-center gap-4 bg-neutral-900/50 rounded-full px-4 py-2 border border-white/5">
          <button @click="changeYear(-1)" class="p-1 hover:text-purple-400 transition-colors"><ChevronLeft :size="16" /></button>
          <span class="text-sm font-black font-mono text-white">{{ selectedYear }}</span>
          <button 
            @click="changeYear(1)" 
            class="p-1 hover:text-purple-400 transition-colors disabled:opacity-30 disabled:hover:text-white"
            :disabled="selectedYear >= currentYear"
          >
            <ChevronRight :size="16" />
          </button>
        </div>
      </div>

      <div v-if="isLoading" class="flex flex-col items-center justify-center py-40 gap-6">
        <div class="w-12 h-12 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
        <p class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-600">Calculating Metrics...</p>
      </div>

      <div v-else-if="error" class="flex flex-col items-center justify-center py-20 gap-4 opacity-70">
        <AlertCircle :size="48" class="text-red-500" />
        <p class="text-sm font-bold text-red-400">{{ error }}</p>
        <button @click="fetchStats" class="text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-white underline">Retry Connection</button>
      </div>

      <div v-else-if="stats" class="space-y-8">
        
        <!-- Key Metrics Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <!-- Books Listened -->
          <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden group">
             <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-50" />
             <div class="relative z-10 flex items-center gap-3 text-purple-400">
               <Trophy :size="20" />
               <span class="text-[9px] font-black uppercase tracking-[0.3em]">Books Listened</span>
             </div>
             <div class="relative z-10 flex items-baseline gap-2 mt-2">
                <span class="text-5xl font-black text-white tracking-tighter drop-shadow-lg">{{ totalBooksFinished }}</span>
                <span class="text-sm font-black text-neutral-500 uppercase">Titles</span>
             </div>
          </div>

          <!-- Time Listened -->
          <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden group">
             <div class="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-50" />
             <div class="relative z-10 flex items-center gap-3 text-blue-400">
               <Clock :size="20" />
               <span class="text-[9px] font-black uppercase tracking-[0.3em]">Time Listened</span>
             </div>
             <div class="relative z-10 flex items-baseline gap-2 mt-2">
                <div class="flex items-baseline">
                  <span class="text-5xl font-black text-white tracking-tighter drop-shadow-lg">{{ prettyTotalTime.h }}</span>
                  <span class="text-sm font-black text-neutral-500 uppercase ml-1 mr-2">H</span>
                  <span class="text-3xl font-black text-white/70 tracking-tighter">{{ prettyTotalTime.m }}</span>
                  <span class="text-xs font-black text-neutral-500 uppercase ml-1">M</span>
                </div>
             </div>
          </div>

          <!-- Active Days -->
          <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden group">
             <div class="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-50" />
             <div class="relative z-10 flex items-center gap-3 text-green-400">
               <Calendar :size="20" />
               <span class="text-[9px] font-black uppercase tracking-[0.3em]">Active Sessions</span>
             </div>
             <div class="relative z-10 flex items-baseline gap-2 mt-2">
                <span class="text-5xl font-black text-white tracking-tighter drop-shadow-lg">{{ activeDaysCount }}</span>
                <span class="text-sm font-black text-neutral-500 uppercase">Days</span>
             </div>
          </div>

        </div>

        <!-- Activity Chart -->
        <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-8 flex flex-col gap-4">
           <div class="flex items-center gap-3 text-neutral-400">
             <BarChart2 :size="20" />
             <span class="text-[9px] font-black uppercase tracking-[0.3em]">Volume by Month</span>
           </div>
           <div class="flex-1 flex items-end justify-between gap-2 pt-6 h-40">
               <div 
                 v-for="(val, index) in monthlyData" 
                 :key="index"
                 class="flex-1 bg-neutral-800 rounded-t-sm hover:bg-purple-500 transition-colors relative group flex flex-col justify-end"
               >
                  <!-- Bar Element -->
                  <div 
                    class="w-full bg-neutral-700 hover:bg-purple-500 transition-all rounded-t-sm relative"
                    :style="{ height: val > 0 ? `${(val / maxMonthlyValue) * 100}%` : '2px', opacity: val > 0 ? 1 : 0.1 }"
                  >
                    <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-black text-[9px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-lg">
                        {{ Math.round(val / 3600) }} hrs
                    </div>
                  </div>
               </div>
           </div>
           <div class="flex justify-between text-[8px] font-black uppercase text-neutral-600 mt-2">
              <span v-for="(m, i) in monthNames" :key="i" class="w-full text-center">{{ m }}</span>
           </div>
        </div>

        <!-- Recent Sessions List -->
        <div class="space-y-6">
            <div class="flex items-center gap-3 text-neutral-400 px-2 border-b border-white/5 pb-4">
                <PlayCircle :size="18" />
                <span class="text-[9px] font-black uppercase tracking-[0.3em]">Session Log</span>
            </div>
            
            <div v-if="recentSessions.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div v-for="(session, index) in recentSessions" :key="index" class="bg-neutral-900/30 border border-white/5 rounded-xl p-4 flex items-center justify-between hover:border-white/10 transition-colors">
                    <div class="flex items-center gap-4">
                        <div class="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-mono font-bold text-neutral-500">
                            {{ (index + 1) }}
                        </div>
                        <div class="flex flex-col">
                            <span class="text-sm font-bold text-white line-clamp-1">{{ session.mediaMetadata?.title || 'Unknown Title' }}</span>
                            <span class="text-[10px] text-neutral-500 uppercase tracking-wider">{{ session.mediaMetadata?.author || 'Unknown Author' }}</span>
                        </div>
                    </div>
                    <div class="text-right pl-4">
                         <span class="text-xs font-mono font-bold text-purple-400 block">{{ Math.round((session.timeListening || 0) / 60) }}m</span>
                         <span class="text-[8px] text-neutral-600 uppercase">{{ new Date(session.updatedAt).toLocaleDateString() }}</span>
                    </div>
                </div>
            </div>
            <div v-else class="text-center py-10 opacity-50">
                <p class="text-[9px] font-black uppercase tracking-[0.3em]">No recent sessions recorded</p>
            </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fade-in 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
@keyframes fade-in {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
