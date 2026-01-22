<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ABSService } from '../services/absService';
import { BookOpen, Calendar, BarChart2, AlertCircle, PlayCircle, Trophy } from 'lucide-vue-next';

const props = defineProps<{
  absService: ABSService
}>();

const isLoading = ref(false);
const error = ref<string | null>(null);
const stats = ref<{
  totalTime: number;
  days: Record<string, number>;
  recentSessions: any[];
} | null>(null);

const totalBooksFinished = ref(0);

const monthlyData = computed(() => {
  const months = new Array(12).fill(0);
  if (!stats.value?.days) return months;

  Object.entries(stats.value.days).forEach(([dateStr, seconds]) => {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      months[date.getMonth()] += seconds;
    }
  });
  return months;
});

const maxMonthlyValue = computed(() => {
  return Math.max(...monthlyData.value, 1);
});

const recentSessions = computed(() => {
    return stats.value?.recentSessions || [];
});

const fetchStats = async () => {
  if (!props.absService) return;
  isLoading.value = true;
  error.value = null;
  
  try {
    // 1. Fetch overall listening stats
    const data = await props.absService.getListeningStats();
    if (!data) throw new Error("No stats available.");
    stats.value = data;

    // 2. Fetch specific progress list to accurately count finished books
    const allProgress = await props.absService.getAllUserProgress();
    if (allProgress && Array.isArray(allProgress)) {
      totalBooksFinished.value = allProgress.filter(p => p.isFinished).length;
    }

  } catch (e: any) {
    console.error("Failed to fetch stats", e);
    error.value = e.message || "Could not retrieve analytical data.";
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchStats();
});

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const currentYear = new Date().getFullYear();
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden animate-fade-in relative bg-[#0d0d0d] -mx-4 md:-mx-8">
    <div class="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-40">
      
      <!-- Header -->
      <div class="pt-8 pb-12">
        <h1 class="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white mb-2">My Analytics</h1>
        <p class="text-[10px] font-black uppercase tracking-[0.4em] text-purple-500">{{ currentYear }} Year in Review</p>
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

      <div v-else-if="stats" class="space-y-12">
        
        <!-- Main KPI: Books Read -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          <!-- Books Finished Card -->
          <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-8 flex flex-col gap-6 relative overflow-hidden group">
             <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-50" />
             <div class="relative z-10 flex items-center gap-3 text-purple-400">
               <Trophy :size="24" />
               <span class="text-[10px] font-black uppercase tracking-[0.3em]">Total Books Read</span>
             </div>
             <div class="relative z-10 flex items-baseline gap-2">
                <span class="text-7xl font-black text-white tracking-tighter drop-shadow-lg">{{ totalBooksFinished }}</span>
                <span class="text-xl font-black text-neutral-500 uppercase">Titles</span>
             </div>
             <div class="relative z-10 w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div class="h-full bg-purple-500 w-full animate-pulse" />
             </div>
          </div>

           <!-- Activity Chart -->
           <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-8 flex flex-col gap-4 md:col-span-2">
             <div class="flex items-center gap-3 text-green-400">
               <BarChart2 :size="20" />
               <span class="text-[9px] font-black uppercase tracking-[0.3em]">Listening Volume ({{ currentYear }})</span>
             </div>
             <div class="flex-1 flex items-end justify-between gap-2 pt-6 h-32">
                 <div 
                   v-for="(val, index) in monthlyData" 
                   :key="index"
                   class="flex-1 bg-neutral-800 rounded-t-sm hover:bg-green-500 transition-colors relative group"
                   :style="{ height: `${(val / maxMonthlyValue) * 100}%`, minHeight: '4px' }"
                 >
                    <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-black text-[9px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {{ Math.round(val / 3600) }} hrs
                    </div>
                 </div>
             </div>
             <div class="flex justify-between text-[8px] font-black uppercase text-neutral-600 mt-2">
                <span v-for="(m, i) in monthNames" :key="i" class="w-full text-center">{{ m }}</span>
             </div>
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