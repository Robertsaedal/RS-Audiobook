<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ABSService } from '../services/absService';
import { ChevronDown, Trophy, Clock, Calendar, BarChart2 } from 'lucide-vue-next';

const props = defineProps<{
  absService: ABSService
}>();

const currentYear = ref(new Date().getFullYear());
const selectedYear = ref(new Date().getFullYear());
const isLoading = ref(false);
const stats = ref<{
  totalTime: number;
  items: { id: string; title: string; author?: string }[];
  days: Record<string, number>;
} | null>(null);

const availableYears = computed(() => {
  const years = [];
  const startYear = 2020; // Assume start
  const end = currentYear.value;
  for (let y = end; y >= startYear; y--) {
    years.push(y);
  }
  return years;
});

const formattedTime = computed(() => {
  if (!stats.value) return { d: 0, h: 0, m: 0 };
  const totalSeconds = stats.value.totalTime;
  const days = Math.floor(totalSeconds / 86400);
  const remainingSeconds = totalSeconds % 86400;
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  return { d: days, h: hours, m: minutes };
});

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
  return Math.max(...monthlyData.value, 1); // Avoid div by zero
});

const fetchStats = async () => {
  if (!props.absService) return;
  isLoading.value = true;
  try {
    stats.value = await props.absService.getUserStatsForYear(selectedYear.value);
  } catch (e) {
    console.error("Failed to fetch stats", e);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchStats();
});

watch(selectedYear, () => {
  fetchStats();
});

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden animate-fade-in relative bg-[#0d0d0d] -mx-4 md:-mx-8">
    <div class="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-40">
      
      <!-- Header -->
      <div class="pt-8 pb-12 flex items-center justify-between">
        <div>
          <h1 class="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white mb-2">Year In Review</h1>
          <p class="text-[10px] font-black uppercase tracking-[0.4em] text-purple-500">Listening Analytics</p>
        </div>
        
        <div class="relative group">
           <select 
             v-model="selectedYear"
             class="appearance-none bg-neutral-900 border border-white/10 rounded-full py-3 pl-6 pr-12 text-sm font-bold text-white outline-none focus:border-purple-500/50 cursor-pointer hover:bg-neutral-800 transition-colors"
           >
             <option v-for="y in availableYears" :key="y" :value="y">{{ y }}</option>
           </select>
           <ChevronDown :size="16" class="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
        </div>
      </div>

      <div v-if="isLoading" class="flex flex-col items-center justify-center py-40 gap-6">
        <div class="w-12 h-12 border-2 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
        <p class="text-[8px] font-black uppercase tracking-[0.6em] text-neutral-600">Calculating Metadata...</p>
      </div>

      <div v-else-if="stats" class="space-y-12">
        
        <!-- Hero Stats -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Books Read Card -->
          <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-8 relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div class="relative z-10 flex flex-col gap-4">
               <div class="flex items-center gap-3 text-purple-400">
                 <Trophy :size="20" />
                 <span class="text-[9px] font-black uppercase tracking-[0.3em]">Completed</span>
               </div>
               <div class="flex items-baseline gap-2">
                 <span class="text-6xl font-black text-white tracking-tighter">{{ stats.items.length }}</span>
                 <span class="text-lg font-bold text-neutral-500 uppercase">Books</span>
               </div>
               <p class="text-xs text-neutral-400 leading-relaxed max-w-xs">
                 You've journeyed through <span class="text-white font-bold">{{ stats.items.length }}</span> distinct narratives this cycle.
               </p>
            </div>
          </div>

          <!-- Time Listening Card -->
          <div class="bg-neutral-900/40 border border-white/5 rounded-3xl p-8 relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div class="relative z-10 flex flex-col gap-4">
               <div class="flex items-center gap-3 text-blue-400">
                 <Clock :size="20" />
                 <span class="text-[9px] font-black uppercase tracking-[0.3em]">Time Active</span>
               </div>
               <div class="flex items-baseline gap-2">
                 <div class="flex flex-col">
                   <div class="flex items-baseline gap-2">
                      <span class="text-4xl md:text-5xl font-black text-white tracking-tighter">{{ formattedTime.d }}<span class="text-base text-neutral-600 ml-1 mr-3">D</span></span>
                      <span class="text-4xl md:text-5xl font-black text-white tracking-tighter">{{ formattedTime.h }}<span class="text-base text-neutral-600 ml-1 mr-3">H</span></span>
                      <span class="text-4xl md:text-5xl font-black text-white tracking-tighter">{{ formattedTime.m }}<span class="text-base text-neutral-600 ml-1">M</span></span>
                   </div>
                 </div>
               </div>
               <p class="text-xs text-neutral-400 leading-relaxed">
                 Total duration spent connected to the audio stream.
               </p>
            </div>
          </div>
        </div>

        <!-- Monthly Activity Chart -->
        <div class="bg-neutral-900/30 border border-white/5 rounded-3xl p-8 space-y-8">
           <div class="flex items-center gap-3 text-neutral-400">
             <BarChart2 :size="18" />
             <span class="text-[9px] font-black uppercase tracking-[0.3em]">Monthly Velocity</span>
           </div>

           <div class="h-48 flex items-end justify-between gap-2 md:gap-4 px-2">
             <div 
               v-for="(val, index) in monthlyData" 
               :key="index"
               class="flex-1 flex flex-col items-center gap-3 group relative"
             >
               <div 
                 class="w-full bg-neutral-800 rounded-t-lg transition-all duration-700 hover:bg-purple-600 relative min-h-[4px]"
                 :style="{ height: `${(val / maxMonthlyValue) * 100}%` }"
               >
                 <!-- Tooltip -->
                 <div class="absolute -top-10 left-1/2 -translate-x-1/2 bg-neutral-900 border border-white/10 px-3 py-1.5 rounded-lg text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none">
                    {{ Math.round(val / 3600) }} hrs
                 </div>
               </div>
               <span class="text-[8px] font-black uppercase text-neutral-600 tracking-wider">{{ monthNames[index] }}</span>
             </div>
           </div>
        </div>

        <!-- Book Grid -->
        <div class="space-y-6">
          <div class="flex items-center gap-3 text-neutral-400 px-2">
             <Calendar :size="18" />
             <span class="text-[9px] font-black uppercase tracking-[0.3em]">Artifact Log</span>
          </div>

          <div v-if="stats.items.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            <div 
              v-for="item in stats.items" 
              :key="item.id"
              class="relative aspect-[2/3] bg-neutral-900 rounded-xl overflow-hidden border border-white/5 group shadow-lg"
            >
              <img 
                :src="absService.getCoverUrl(item.id)" 
                class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                loading="lazy"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                <span class="text-xs font-bold text-white line-clamp-2 leading-tight">{{ item.title }}</span>
                <span class="text-[9px] text-neutral-400 mt-1 uppercase tracking-wider">{{ item.author || 'Unknown' }}</span>
              </div>
            </div>
          </div>
          
          <div v-else class="text-center py-12 border border-white/5 rounded-3xl border-dashed">
            <p class="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-600">No data recorded for this period</p>
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