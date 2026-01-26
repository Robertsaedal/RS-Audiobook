
<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ABSLibraryItem } from '../types';
import { ABSService } from '../services/absService';
import { TranscriptionService } from '../services/transcriptionService';
import { Sparkles, Send, X, ShieldCheck, BookOpen, Loader2, BrainCircuit } from 'lucide-vue-next';

const props = defineProps<{
  item: ABSLibraryItem,
  currentTime: number,
  absService: ABSService
}>();

const emit = defineEmits<{
  (e: 'close'): void
}>();

// AI State
const userInput = ref('');
const messages = ref<{ role: 'user' | 'model', text: string }[]>([]);
const isThinking = ref(false);
const isBuildingContext = ref(true);
const contextReady = ref(false);
const includedBooks = ref<string[]>([]);
const knowledgeBase = ref('');
const messagesContainer = ref<HTMLElement | null>(null);

// Initialize Gemini Client
const apiKey = process.env.API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

const buildKnowledgeBase = async () => {
  isBuildingContext.value = true;
  try {
    const { context, booksIncluded } = await TranscriptionService.getOracleContext(
      props.item,
      props.currentTime,
      props.absService
    );
    knowledgeBase.value = context;
    includedBooks.value = booksIncluded;
    contextReady.value = true;
  } catch (e) {
    console.error("[Oracle] Failed to build context", e);
    messages.value.push({ 
      role: 'model', 
      text: 'I am unable to access the archives for this book. My knowledge is limited to general information.' 
    });
  } finally {
    isBuildingContext.value = false;
  }
};

const sendMessage = async () => {
  if (!userInput.value.trim() || isThinking.value) return;

  const query = userInput.value;
  userInput.value = '';
  messages.value.push({ role: 'user', text: query });
  scrollToBottom();

  isThinking.value = true;

  try {
    const systemInstruction = `
      You are the Oracle of the Archive. 
      You are an expert on the book series: "${props.item.media.metadata.seriesName || props.item.media.metadata.title}".
      
      RULES:
      1. You only know what is provided in the CONTEXT below.
      2. If the user asks about events BEYOND the "Current Reading Position" defined in the context, you MUST politely refuse and say it is a spoiler.
      3. You have full access to previous books in the series (if provided in context).
      4. Keep answers concise, mystical but helpful.
      5. Do not hallucinate events not in the text.

      FORMATTING:
      - Use **Bold** for character names or key locations.
      - Use ### headers for distinct chapter or scene breaks.
      - Break long explanations into bullet points.
      - Always use double line breaks between paragraphs for readability.
      
      CONTEXT DATA:
      ${knowledgeBase.value}
    `;

    // Use gemini-3-flash-preview as per standard guidelines
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3-flash-preview',
      systemInstruction: systemInstruction 
    });

    let responseText = '';
    const retries = 3;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await model.generateContent(query);
        const response = await result.response;
        responseText = response.text();
        break; 
      } catch (err: any) {
        const isRateLimit = err.message?.includes('429') || err.status === 429;
        if (isRateLimit && attempt < retries - 1) {
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }

    if (responseText) {
      messages.value.push({ role: 'model', text: responseText });
    }
  } catch (e: any) {
    console.error("[Oracle] Generation failed", e);
    let errorText = 'The mists of the archive are too thick. I cannot see the answer right now.';
    
    if (e.message?.includes('403')) {
      errorText = 'Access Denied (403): Please check your API Key configuration.';
    } else if (e.message?.includes('429')) {
      errorText = 'The Oracle is overwhelmed with requests. Please try again in a moment.';
    }
    
    messages.value.push({ role: 'model', text: errorText });
  } finally {
    isThinking.value = false;
    scrollToBottom();
  }
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

onMounted(() => {
  buildKnowledgeBase();
});

</script>

<template>
  <div class="w-full h-full bg-[#0f0f14]/70 backdrop-blur-[25px] rounded-[32px] border border-white/10 flex flex-col overflow-hidden relative shadow-[0_0_50px_rgba(168,85,247,0.15)]">
    
    <!-- Cinematic Glow Background -->
    <div class="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_rgba(168,85,247,0.05),_transparent_60%)] pointer-events-none animate-pulse-slow"></div>

    <!-- Header -->
    <div class="relative z-20 flex items-center justify-between p-5 border-b border-white/5 bg-black/20">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400">
           <BrainCircuit :size="18" />
        </div>
        <div>
          <h2 class="text-sm font-black uppercase tracking-widest text-white">Book Oracle</h2>
          <div v-if="contextReady" class="flex items-center gap-1.5 text-purple-400 animate-fade-in shadow-purple-glow">
             <ShieldCheck :size="10" />
             <span class="text-[8px] font-black uppercase tracking-[0.2em]">Spoiler-Free Mode Active</span>
          </div>
        </div>
      </div>
      <button @click="emit('close')" class="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white border border-white/5">
        <X :size="16" />
      </button>
    </div>

    <!-- Main Chat Area -->
    <div class="flex-1 overflow-hidden relative flex flex-col">
      
      <!-- Context Loading State -->
      <div v-if="isBuildingContext" class="absolute inset-0 z-30 flex flex-col items-center justify-center bg-neutral-900/80 backdrop-blur-sm gap-4">
        <div class="relative">
          <div class="absolute inset-0 bg-purple-500 rounded-full blur-xl opacity-20 animate-ping"></div>
          <Loader2 :size="32" class="text-purple-500 animate-spin relative z-10" />
        </div>
        <p class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400">Reading Archives...</p>
      </div>

      <!-- Messages -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto purple-scrollbar p-6 space-y-6">
        
        <!-- Welcome Message -->
        <div v-if="messages.length === 0 && !isBuildingContext" class="flex flex-col items-center justify-center h-full text-center opacity-50 space-y-4 animate-fade-in-up">
          <Sparkles :size="48" class="text-purple-500/50" />
          <p class="text-[10px] font-black uppercase tracking-widest max-w-[200px] leading-relaxed">
            Ask about characters, plot points, or lore. I will only use knowledge from what you have read so far.
          </p>
          
          <!-- Memory Visualization -->
          <div v-if="includedBooks.length > 0" class="flex flex-wrap justify-center gap-2 mt-4 max-w-xs">
             <div v-for="(book, idx) in includedBooks" :key="idx" class="px-2 py-1 bg-white/5 rounded border border-white/5 text-[8px] text-neutral-400 flex items-center gap-1">
               <BookOpen :size="8" />
               <span class="truncate max-w-[80px]">{{ book }}</span>
             </div>
          </div>
        </div>

        <div 
          v-for="(msg, i) in messages" 
          :key="i" 
          class="flex flex-col gap-1 max-w-[90%] animate-fade-in-up"
          :class="msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'"
        >
          <div 
            class="px-5 py-3 rounded-2xl text-sm leading-relaxed backdrop-blur-md shadow-lg markdown-content"
            :class="[
              msg.role === 'user' 
                ? 'bg-purple-600 text-white rounded-tr-sm' 
                : 'bg-white/10 text-neutral-200 border border-white/5 rounded-tl-sm'
            ]"
            v-html="msg.text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')"
          >
          </div>
          <span class="text-[8px] font-bold uppercase tracking-widest opacity-40 mx-2">
            {{ msg.role === 'user' ? 'You' : 'Oracle' }}
          </span>
        </div>

      </div>

      <!-- Input Area -->
      <div class="p-4 bg-black/40 border-t border-white/5 relative z-20">
        <div class="relative group">
          <input 
            v-model="userInput"
            @keydown.enter="sendMessage"
            type="text" 
            placeholder="Ask the archives..."
            class="w-full bg-neutral-900/50 border border-purple-500/30 rounded-full py-4 pl-6 pr-14 text-sm text-white placeholder-neutral-500 focus:outline-none focus:shadow-[0_0_15px_rgba(168,85,247,0.3)] focus:border-purple-500/50 transition-all"
          />
          <button 
            @click="sendMessage"
            :disabled="!userInput.trim() || isThinking"
            class="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full text-white transition-all disabled:opacity-50"
            :class="isThinking ? 'cursor-default' : 'bg-purple-600 shadow-[0_0_15px_rgba(168,85,247,0.4)] hover:bg-purple-500 hover:scale-105 active:scale-95'"
          >
            <Sparkles v-if="isThinking" :size="18" class="text-purple-400 animate-pulse" />
            <Send v-else :size="16" />
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.purple-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.purple-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.purple-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(168, 85, 247, 0.2);
  border-radius: 10px;
}
.animate-pulse-slow {
  animation: pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.animate-fade-in-up {
  animation: fadeInUp 0.4s ease-out forwards;
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.shadow-purple-glow {
  text-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
}
</style>
