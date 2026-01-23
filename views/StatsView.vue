
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ABSService } from '../services/absService';
import { ABSProgress } from '../types';
import { AlertCircle, PlayCircle, Trophy, ChevronLeft, ChevronRight, Clock, Calendar, BarChart2 } from 'lucide-vue-next';

const props = defineProps<{
  absService: ABSService,
  progressMap?: Map<string, ABSProgress>
}>();

const isLoading = ref(false);
const error = ref<string | null>(null);
const stats = ref<{
  totalTime: number;
  days: Record<string, number>;
  items?: any[];
  recentSessions?: any[];
} | null>(null);

const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);

// Helper to parse year and month from keys (supports YYYY-MM-DD, YYYY/MM/DD, and timestamps)
const parseYearMonth = (key: string) => {
  // Try YYYY-MM-DD or YYYY/MM/DD
  const dateMatch = key.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (dateMatch) {
    return {
      year: parseInt(dateMatch[1], 10),
      month: parseInt(dateMatch[2], 10) - 1
    };
  }
  // Try ISO string or something new Date can handle directly
  const d = new Date(key);
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth()
    };
  }
  // Try Timestamp (numeric string)
  const asNum = Number(key);
  if (!isNaN(asNum) && asNum > 1000000) {
    // Check if seconds or milliseconds
    const date = new Date(asNum > 10000000000 ? asNum : asNum * 1000);
    if (!isNaN(date.getTime())) {
      return {
        year: date.getFullYear(),
        month: date.getMonth()
      };
    }
  }
  return null;
};

// Calculate books finished in the selected year
const totalBooksFinished = computed(() => {
  if (props.progressMap && props.progressMap.size > 0) {
    let count = 0;
    for (const p of props.progressMap.values()) {
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

const totalListeningTime = computed(() => {
  if (!stats.value?.days) return 0;
  let total = 0;
  Object.entries(stats.value.days).forEach(([dateStr, seconds]) => {
    const parsed = parseYearMonth(dateStr);
    if (parsed && parsed.year === selectedYear.value) {
      total += Number(seconds);
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
    const parsed = parseYearMonth(dateStr);
    if (parsed && parsed.year === selectedYear.value && Number(seconds) > 0) {
       count++;
    }
  });
  return count;
});

// Chart Data Aggregation
const monthlyChartData = computed(() => {
  const months = new Array(12).fill(0);
  if (!stats.value?.days) return months;

  Object.entries(stats.value.days).forEach(([dateStr, seconds]) => {
    const parsed = parseYearMonth(dateStr);
    if (parsed && parsed.year === selectedYear.value) {
      // Convert to hours for the chart
      months[parsed.month] += (Number(seconds) / 3600);
    }
  });
  return months;
});

const maxChartValue = computed(() => {
  const max = Math.max(...monthlyChartData.value);
  return max > 0 ? max : 10; // Default scale if empty
});

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const displaySessions = computed(() => {
    // ABS API sometimes returns sessions in 'recentSessions' or 'items' depending on version
    return stats.value?.items || stats.value?.recentSessions || [];
});

const formatTooltipDuration = (seconds: number) => {
  if (seconds === 0) return 'No data';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
};

const fetchStats = async () => {
  if (!props.absService) return;
  isLoading.value = true;
  error.value = null;
  
  try {
    const data = await props.absService.getListeningStats();
    if (!data) throw new Error("Portal returned null analytics.");
    stats.value = data;
  } catch (e: any) {
    console.error("Stats acquisition failure", e);
    error.value = e.message || "Archive analytics unreachable.";
  } finally {
    isLoading.value = false;
  }
};

const changeYear = (delta: number) => {
  selectedYear.value += delta;
};

watch(selectedYear, () => {
  // If we had an API that filtered by year server-side, we'd call it here.
  // Since ABS usually returns all history or we are using client side filtering, just re-compute.
});

onMounted(() => {
  fetchStats();
});
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden animate-fade-in relative bg-[#0d0d0d]">
    <div class="flex-1 overflow-y-auto custom-scrollbar pb-40">
      
      <!-- Header -->
      <div class="pt-8 pb-8 flex items-end justify-between">
        <div>
          <h1 class="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white mb-2">Analytics</h1>
          <p class="text-[10px] font-black uppercase tracking-[0.4em] text-purple-500">Listening Intelligence</p>
        </div>
        
        <div class="flex items-center gap-4 bg-neutral-900/50 rounded-full px-4 py-2 border border-white/5">
          <button @click="changeYear(-1)" class="p-1 hover:text-purple-400 transition-colors tap-effect"><ChevronLeft :size="16" /></button>
          <span class="text-sm font-black font-mono text-white">{{ selectedYear }}</span>
          <button 
            @click="changeYear(1)" 
            class="p-1 hover:text-purple-400 transition-colors disabled:opacity-30 disabled:hover:text-white tap-effect"
            :disabled="selectedYear >= currentYear"
          >
            <ChevronRight :size="16" />
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-40 gap-6">
        <div class="w-12 h-12 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
        <p class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-600">Syncing Metrics...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex flex-col items-center justify-center py-20 gap-4 opacity-70">
        <AlertCircle :size="48" class="text-red-500" />
        <p class="text-sm font-bold text-red-400">{{ error }}</p>
        <button @click="fetchStats" class="text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-white underline">Retry Fetch</button>
      </div>

      <!-- Stats Content: Bento Grid -->
      <div v-else-if="stats" class="space-y-4">
        
        <!-- Metrics Cards Row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden group">
             <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-50" />
             <div class="relative z-10 flex items-center gap-3 text-purple-500">
               <Trophy :size="20" />
               <span class="text-[9px] font-black uppercase tracking-[0.3em] text-white/70">Books Finished</span>
             </div>
             <div class="relative z-10 flex items-baseline gap-2 mt-2">
                <span class="text-5xl font-black text-white tracking-tighter">{{ totalBooksFinished }}</span>
                <span class="text-sm font-black text-neutral-500 uppercase">Titles</span>
             </div>
          </div>

          <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden group">
             <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-50" />
             <div class="relative z-10 flex items-center gap-3 text-purple-500">
               <Clock :size="20" />
               <span class="text-[9px] font-black uppercase tracking-[0.3em] text-white/70">Total Listen</span>
             </div>
             <div class="relative z-10 flex items-baseline gap-2 mt-2">
                <div class="flex items-baseline">
                  <span class="text-5xl font-black text-white tracking-tighter">{{ prettyTotalTime.h }}</span>
                  <span class="text-sm font-black text-neutral-500 uppercase ml-1 mr-2">H</span>
                  <span class="text-3xl font-black text-white/70 tracking-tighter">{{ prettyTotalTime.m }}</span>
                  <span class="text-xs font-black text-neutral-500 uppercase ml-1">M</span>
                </div>
             </div>
          </div>

          <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden group">
             <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-50" />
             <div class="relative z-10 flex items-center gap-3 text-purple-500">
               <Calendar :size="20" />
               <span class="text-[9px] font-black uppercase tracking-[0.3em] text-white/70">Active Days</span>
             </div>
             <div class="relative z-10 flex items-baseline gap-2 mt-2">
                <span class="text-5xl font-black text-white tracking-tighter">{{ activeDaysCount }}</span>
                <span class="text-sm font-black text-neutral-500 uppercase">Days</span>
             </div>
          </div>
        </div>

        <!-- Volume Chart -->
        <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-6 md:p-8 mt-4">
           <div class="flex items-center gap-3 text-neutral-500 mb-8">
              <BarChart2 :size="18" class="text-purple-500" />
              <span class="text-[9px] font-black uppercase tracking-[0.3em] text-white">Volume by Month</span>
           </div>
           
           <div class="h-48 md:h-64 flex items-end justify-between gap-2 md:gap-4 relative">
              <!-- Grid Lines (Optional visual) -->
              <div class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                 <div class="w-full h-px bg-white"></div>
                 <div class="w-full h-px bg-white"></div>
                 <div class="w-full h-px bg-white"></div>
                 <div class="w-full h-px bg-white"></div>
                 <div class="w-full h-px bg-white"></div>
              </div>

              <div 
                v-for="(hours, index) in monthlyChartData" 
                :key="index"
                class="flex flex-col items-center justify-end h-full flex-1 group relative z-10"
              >
                <!-- Tooltip -->
                <div class="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 bg-neutral-800 text-white text-[9px] font-bold px-2 py-1 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none border border-white/10">
                   {{ hours.toFixed(1) }} Hours
                </div>

                <!-- Bar -->
                <div 
                  class="w-full md:w-4/5 bg-neutral-800 rounded-t-sm transition-all duration-500 ease-out group-hover:bg-purple-500 relative overflow-hidden"
                  :style="{ height: `${(hours / maxChartValue) * 100}%` }"
                >
                   <div class="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent" />
                </div>
                
                <!-- Label -->
                <span class="text-[8px] md:text-[9px] font-bold text-neutral-600 mt-3 uppercase tracking-wider group-hover:text-purple-400 transition-colors">
                  {{ monthLabels[index] }}
                </span>
              </div>
           </div>
        </div>

        <!-- Activity History -->
        <div class="space-y-4 mt-8">
            <div class="flex items-center gap-3 text-neutral-500 px-2 pb-2">
                <PlayCircle :size="18" class="text-purple-500" />
                <span class="text-[9px] font-black uppercase tracking-[0.3em] text-white">Recent Activity</span>
            </div>
            
            <div v-if="displaySessions.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div v-for="(session, index) in displaySessions.slice(0, 10)" :key="index" class="bg-neutral-900/30 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:border-white/10 transition-colors">
                    <div class="flex items-center gap-4 truncate">
                        <div class="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-mono font-bold text-neutral-500 shrink-0">
                            {{ (index + 1) }}
                        </div>
                        <div class="flex flex-col truncate">
                            <span class="text-sm font-bold text-white truncate">{{ session.mediaMetadata?.title || session.title || 'Unknown Title' }}</span>
                            <span class="text-[10px] text-neutral-600 uppercase tracking-wider truncate">{{ session.mediaMetadata?.author || session.author || 'Unknown Creator' }}</span>
                        </div>
                    </div>
                    <div class="text-right pl-4 shrink-0">
                         <span class="text-xs font-mono font-bold text-purple-400 block">{{ formatTooltipDuration(session.timeListening || session.totalTime || 0) }}</span>
                         <span class="text-[8px] text-neutral-700 uppercase">{{ session.updatedAt ? new Date(session.updatedAt).toLocaleDateString() : '' }}</span>
                    </div>
                </div>
            </div>
            <div v-else class="text-center py-10 opacity-30">
                <p class="text-[9px] font-black uppercase tracking-[0.4em]">No recent artifact activity recorded</p>
            </div>
        </div>

      </div>
    </div>
  </div>
</template>
