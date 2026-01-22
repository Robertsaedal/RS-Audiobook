
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ABSService } from '../services/absService';
import { ABSProgress } from '../types';
import { BarChart2, AlertCircle, PlayCircle, Trophy, ChevronLeft, ChevronRight, Clock, Calendar, RefreshCcw } from 'lucide-vue-next';

const props = defineProps<{
  absService: ABSService,
  progressMap?: Map<string, ABSProgress>
}>();

const isLoading = ref(false);
const error = ref<string | null>(null);
const stats = ref<any>(null);

const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);

/**
 * Universal date parser for ABS listening stats
 * Handles: YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD, ISO, and Timestamps (Seconds/MS)
 */
const parseYearMonth = (key: any) => {
  if (!key) return null;
  const sKey = String(key);
  
  // 1. Check YYYY-MM-DD or YYYY/MM/DD
  const dateMatch = sKey.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (dateMatch) {
    return {
      year: parseInt(dateMatch[1], 10),
      month: parseInt(dateMatch[2], 10) - 1
    };
  }

  // 2. Check YYYYMMDD (8 digits)
  if (/^\d{8}$/.test(sKey)) {
    return {
      year: parseInt(sKey.substring(0, 4), 10),
      month: parseInt(sKey.substring(4, 6), 10) - 1
    };
  }

  // 3. Check for Numeric Timestamps
  const asNum = Number(sKey);
  if (!isNaN(asNum) && asNum > 1000000) {
    // If it's in seconds (typical for Unix), multiply by 1000 for JS Date
    const date = new Date(asNum > 10000000000 ? asNum : asNum * 1000);
    if (!isNaN(date.getTime())) {
      return { year: date.getFullYear(), month: date.getMonth() };
    }
  }

  // 4. Fallback to native Date parsing (ISO, etc.)
  const d = new Date(sKey);
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth()
    };
  }

  return null;
};

/**
 * Aggregates listening time into a clean Map to handle inconsistencies in ABS API.
 */
const normalizedDays = computed(() => {
  const result: Record<string, number> = {};
  const rawDays = stats.value?.days;
  
  if (!rawDays) return result;

  // Case: Array of objects [{day: "...", timeListening: 123}, ...]
  if (Array.isArray(rawDays)) {
    rawDays.forEach((item: any) => {
      const key = item.day || item.date || item.id || item.addedAt;
      const val = item.timeListening || item.seconds || item.totalTime || item.duration || 0;
      if (key) result[key] = Number(val);
    });
    return result;
  }

  // Case: Object/Map {"2024-01-01": 3600} or {"2024-01-01": {timeListening: 3600}}
  Object.entries(rawDays).forEach(([key, val]) => {
    if (typeof val === 'object' && val !== null) {
      result[key] = Number((val as any).timeListening || (val as any).seconds || (val as any).totalTime || 0);
    } else {
      result[key] = Number(val || 0);
    }
  });

  return result;
});

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

// Aggregated bar data for the monthly chart
const monthlyData = computed(() => {
  const months = new Array(12).fill(0);
  Object.entries(normalizedDays.value).forEach(([dateStr, seconds]) => {
    const parsed = parseYearMonth(dateStr);
    if (parsed && parsed.year === selectedYear.value) {
      if (parsed.month >= 0 && parsed.month < 12) {
        months[parsed.month] += seconds;
      }
    }
  });
  return months;
});

const totalListeningTime = computed(() => {
  let total = 0;
  Object.entries(normalizedDays.value).forEach(([dateStr, seconds]) => {
    const parsed = parseYearMonth(dateStr);
    if (parsed && parsed.year === selectedYear.value) {
      total += seconds;
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
  let count = 0;
  Object.entries(normalizedDays.value).forEach(([dateStr, seconds]) => {
    const parsed = parseYearMonth(dateStr);
    if (parsed && parsed.year === selectedYear.value && seconds > 0) {
       count++;
    }
  });
  return count;
});

const maxMonthlyValue = computed(() => {
  const max = Math.max(...monthlyData.value);
  return max > 0 ? max : 1; 
});

const displaySessions = computed(() => {
    // Check all possible keys where ABS might return session history
    const sessions = stats.value?.items || stats.value?.recentSessions || stats.value?.sessions || [];
    return Array.isArray(sessions) ? sessions : [];
});

const formatDuration = (seconds: number) => {
  if (seconds === 0) return '0m';
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
    if (!data) throw new Error("Portal returned empty data set.");
    stats.value = data;
    
    // Auto-detect best year for display
    // We check the raw data immediately after normalization
    const daysData = normalizedDays.value;
    const yearsFound = new Set<number>();
    
    Object.keys(daysData).forEach(key => {
      const p = parseYearMonth(key);
      if (p) yearsFound.add(p.year);
    });

    if (yearsFound.size > 0) {
      const sortedYears = Array.from(yearsFound).sort((a, b) => b - a);
      // If selected year is empty, jump to the most recent year with data
      if (!yearsFound.has(selectedYear.value)) {
        selectedYear.value = sortedYears[0];
      }
    }
  } catch (e: any) {
    console.error("Stats acquisition error:", e);
    error.value = e.message || "Failed to retrieve archive analytics.";
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
      
      <!-- Header -->
      <div class="pt-8 pb-8 flex items-end justify-between">
        <div class="min-w-0">
          <h1 class="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white mb-2 truncate">Analytics</h1>
          <p class="text-[10px] font-black uppercase tracking-[0.4em] text-purple-500">Listening Pipeline</p>
        </div>
        
        <div class="flex items-center gap-4 bg-neutral-900/50 rounded-full px-4 py-2 border border-white/5 shrink-0">
          <button @click="changeYear(-1)" class="p-1 hover:text-purple-400 transition-colors"><ChevronLeft :size="16" /></button>
          <span class="text-sm font-black font-mono text-white">{{ selectedYear }}</span>
          <button 
            @click="changeYear(1)" 
            class="p-1 hover:text-purple-400 transition-colors disabled:opacity-20 disabled:hover:text-white"
            :disabled="selectedYear >= currentYear"
          >
            <ChevronRight :size="16" />
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-40 gap-6">
        <div class="w-12 h-12 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
        <p class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-600">Accessing Archives...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex flex-col items-center justify-center py-20 gap-4 opacity-70">
        <AlertCircle :size="48" class="text-red-500" />
        <p class="text-sm font-bold text-red-400">{{ error }}</p>
        <button @click="fetchStats" class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-white underline">
          <RefreshCcw :size="12" />
          Retry Connection
        </button>
      </div>

      <!-- Stats Content -->
      <div v-else-if="stats" class="space-y-8 animate-fade-in">
        
        <!-- Metrics Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- Finished Titles -->
          <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden group">
             <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-50" />
             <div class="relative z-10 flex items-center gap-3 text-purple-400">
               <Trophy :size="20" />
               <span class="text-[9px] font-black uppercase tracking-[0.3em]">Finished In {{ selectedYear }}</span>
             </div>
             <div class="relative z-10 flex items-baseline gap-2 mt-2">
                <span class="text-5xl font-black text-white tracking-tighter">{{ totalBooksFinished }}</span>
                <span class="text-sm font-black text-neutral-500 uppercase">Titles</span>
             </div>
          </div>

          <!-- Time Listening -->
          <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden group">
             <div class="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-50" />
             <div class="relative z-10 flex items-center gap-3 text-blue-400">
               <Clock :size="20" />
               <span class="text-[9px] font-black uppercase tracking-[0.3em]">Total Listen Time</span>
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

          <!-- Active Engagement -->
          <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden group">
             <div class="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-50" />
             <div class="relative z-10 flex items-center gap-3 text-green-400">
               <Calendar :size="20" />
               <span class="text-[9px] font-black uppercase tracking-[0.3em]">Active Days</span>
             </div>
             <div class="relative z-10 flex items-baseline gap-2 mt-2">
                <span class="text-5xl font-black text-white tracking-tighter">{{ activeDaysCount }}</span>
                <span class="text-sm font-black text-neutral-500 uppercase">Days</span>
             </div>
          </div>
        </div>

        <!-- Volume Chart -->
        <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-8 flex flex-col gap-4">
           <div class="flex items-center gap-3 text-neutral-400">
             <BarChart2 :size="20" />
             <span class="text-[9px] font-black uppercase tracking-[0.3em]">Monthly Volume Trend</span>
           </div>
           
           <div v-if="totalListeningTime > 0" class="flex-1 flex items-end justify-between gap-1.5 md:gap-3 pt-10 h-64">
               <div 
                 v-for="(val, index) in monthlyData" 
                 :key="index"
                 class="flex-1 flex flex-col justify-end group relative h-full"
               >
                  <!-- Tooltip -->
                  <div class="absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-black text-[9px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none shadow-xl border border-white/10">
                      {{ monthNames[index] }}: {{ formatDuration(val) }}
                  </div>

                  <!-- Bar -->
                  <div 
                    class="w-full rounded-t-lg transition-all duration-700 ease-out relative overflow-hidden"
                    :class="val > 0 ? 'bg-gradient-to-t from-purple-800 to-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'bg-white/5'"
                    :style="{ 
                      height: val > 0 ? `${(val / maxMonthlyValue) * 100}%` : '4px',
                      opacity: val > 0 ? 1 : 0.2
                    }"
                  >
                    <!-- Inner Shine -->
                    <div v-if="val > 0" class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  </div>
               </div>
           </div>
           
           <div v-else class="h-64 flex flex-col items-center justify-center opacity-30 border border-white/5 border-dashed rounded-2xl">
              <BarChart2 :size="32" class="mb-2 text-neutral-600" />
              <p class="text-[9px] font-black uppercase tracking-widest text-neutral-600">Archive Empty for {{ selectedYear }}</p>
           </div>

           <div class="flex justify-between text-[8px] font-black uppercase text-neutral-700 mt-6 border-t border-white/5 pt-4">
              <span v-for="(m, i) in monthNames" :key="i" class="w-full text-center" :class="monthlyData[i] > 0 ? 'text-purple-400' : ''">{{ m }}</span>
           </div>
        </div>

        <!-- Activity Log -->
        <div class="space-y-6">
            <div class="flex items-center gap-3 text-neutral-500 px-2 border-b border-white/5 pb-4">
                <PlayCircle :size="18" />
                <span class="text-[9px] font-black uppercase tracking-[0.3em]">Recent Pipeline Activity</span>
            </div>
            
            <div v-if="displaySessions.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div v-for="(session, index) in displaySessions.slice(0, 10)" :key="index" class="bg-neutral-900/30 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:border-white/10 transition-colors">
                    <div class="flex items-center gap-4 truncate">
                        <div class="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-mono font-bold text-neutral-500 shrink-0">
                            {{ (index + 1) }}
                        </div>
                        <div class="flex flex-col truncate">
                            <span class="text-sm font-bold text-white truncate">{{ session.mediaMetadata?.title || session.title || session.libraryItem?.media?.metadata?.title || 'Unknown' }}</span>
                            <span class="text-[10px] text-neutral-600 uppercase tracking-wider truncate">{{ session.mediaMetadata?.author || session.author || session.libraryItem?.media?.metadata?.authorName || 'Creator' }}</span>
                        </div>
                    </div>
                    <div class="text-right pl-4 shrink-0">
                         <span class="text-xs font-mono font-bold text-purple-400 block">{{ formatDuration(session.timeListening || session.totalTime || session.duration || 0) }}</span>
                         <span class="text-[8px] text-neutral-700 uppercase">{{ session.updatedAt || session.addedAt ? new Date(session.updatedAt || session.addedAt).toLocaleDateString() : 'N/A' }}</span>
                    </div>
                </div>
            </div>
            <div v-else class="text-center py-20 opacity-20 border border-white/5 border-dashed rounded-3xl">
                <PlayCircle :size="40" class="mx-auto mb-4" />
                <p class="text-[9px] font-black uppercase tracking-[0.4em]">No recent artifact signals detected</p>
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
