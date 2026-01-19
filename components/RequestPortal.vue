
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { Search, BookOpen, Send, CheckCircle, User, Fingerprint, MessageSquare, Loader2, X, AlertTriangle, RotateCw, Check } from 'lucide-vue-next';
import confetti from 'https://esm.sh/canvas-confetti';

// Configuration
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1462941148321546290/H0cmE88xjO3T73sJMRg0meSc6ar82TmvILqWCWkoN5jKXpNj4CJeJbhkd8I_1fbDtAXF';
const EMBED_COLOR = 11032055; // #A855F7 in decimal

const searchTerm = ref('');
const searchResults = ref<any[]>([]);
const isSearching = ref(false);
const selectedBook = ref<any | null>(null);
const userNote = ref('');
const transmissionStatus = ref<'idle' | 'sending' | 'success' | 'error'>('idle');
const errorMsg = ref('');
const isScanning = ref(false);
const scanFeedback = ref('');

let debounceTimeout: any = null;

// Get ABS Service from parent context (provided or passed via props, but for this component we can use a helper)
import { ABSService } from '../services/absService';
const authData = JSON.parse(localStorage.getItem('rs_auth') || '{}');
const absService = authData.user ? new ABSService(authData.serverUrl, authData.user.token) : null;

const searchBooks = async () => {
  if (!searchTerm.value || searchTerm.value.length < 3) {
    searchResults.value = [];
    return;
  }

  isSearching.value = true;
  errorMsg.value = '';
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchTerm.value)}&maxResults=6`);
    const data = await res.json();
    searchResults.value = data.items || [];
  } catch (e) {
    errorMsg.value = 'Failed to connect to Archive Index.';
    console.error('Search failed', e);
  } finally {
    isSearching.value = false;
  }
};

watch(searchTerm, () => {
  if (debounceTimeout) clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(searchBooks, 500);
});

const selectBook = (book: any) => {
  const info = book.volumeInfo;
  selectedBook.value = {
    title: info.title,
    author: info.authors ? info.authors.join(', ') : 'Unknown Author',
    isbn: info.industryIdentifiers ? info.industryIdentifiers.find((id: any) => id.type === 'ISBN_13')?.identifier || info.industryIdentifiers[0].identifier : 'N/A',
    thumbnail: info.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
  };
  searchTerm.value = '';
  searchResults.value = [];
};

const transmitRequest = async (event: MouseEvent) => {
  if (!selectedBook.value || transmissionStatus.value === 'sending') return;
  
  transmissionStatus.value = 'sending';
  errorMsg.value = '';

  const payload = {
    embeds: [{
      title: `Archive Request: ${selectedBook.value.title}`,
      description: `A new artifact has been flagged for collection.`,
      color: EMBED_COLOR,
      fields: [
        { name: 'Artifact Name', value: selectedBook.value.title, inline: true },
        { name: 'Creator', value: selectedBook.value.author, inline: true },
        { name: 'Registry (ISBN)', value: selectedBook.value.isbn, inline: true },
        { name: 'Directive Note', value: userNote.value || 'None provided.' }
      ],
      thumbnail: {
        url: selectedBook.value.thumbnail || 'https://via.placeholder.com/200?text=No+Artifact+Visual'
      },
      footer: {
        text: 'Aether Transmission Protocol • Portal V5.2'
      },
      timestamp: new Date().toISOString()
    }]
  };

  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      transmissionStatus.value = 'success';
      
      // Trigger Confetti
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      confetti({
        particleCount: 40,
        spread: 70,
        origin: { x: rect.left / window.innerWidth, y: rect.top / window.innerHeight },
        colors: ['#A855F7', '#D8B4FE']
      });

      setTimeout(() => {
        reset();
      }, 3000);
    } else {
      throw new Error(`Transmission Severed: ${res.status}`);
    }
  } catch (e: any) {
    transmissionStatus.value = 'error';
    errorMsg.value = e.message || 'Transmission Failed. Link Severed.';
  }
};

const scanLibrary = async () => {
  if (isScanning.value || !absService) return;
  isScanning.value = true;
  scanFeedback.value = '';
  
  try {
    const success = await absService.scanLibrary();
    if (success) {
      scanFeedback.value = 'Scan Initiated';
      setTimeout(() => scanFeedback.value = '', 3000);
    } else {
      throw new Error('ABS server unreachable.');
    }
  } catch (e: any) {
    scanFeedback.value = 'Scan Failed';
    setTimeout(() => scanFeedback.value = '', 4000);
  } finally {
    isScanning.value = false;
  }
};

const reset = () => {
  selectedBook.value = null;
  userNote.value = '';
  transmissionStatus.value = 'idle';
  searchTerm.value = '';
  errorMsg.value = '';
};
</script>

<template>
  <div class="max-w-4xl mx-auto px-6 pb-40 space-y-12 relative">
    <!-- Header Tools (Sync) -->
    <div class="flex justify-end items-center mb-4">
      <div v-if="scanFeedback" class="mr-4 px-4 py-2 bg-neutral-900/60 border border-white/5 rounded-full text-[9px] font-black uppercase tracking-widest animate-fade-in" :class="scanFeedback === 'Scan Failed' ? 'text-red-500' : 'text-purple-400'">
        {{ scanFeedback }}
      </div>
      <button 
        @click="scanLibrary"
        class="group flex items-center gap-2 px-6 py-3 rounded-full bg-neutral-900/40 backdrop-blur-xl border border-white/5 hover:border-purple-500/30 transition-all active:scale-95"
      >
        <RotateCw 
          :size="16" 
          class="text-neutral-500 group-hover:text-purple-500 transition-colors" 
          :class="{ 'animate-spin text-purple-500 shadow-aether-glow': isScanning }" 
        />
        <span class="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500 group-hover:text-neutral-300">Sync Library</span>
      </button>
    </div>

    <!-- Transmission States -->
    <Transition name="fade-pop" mode="out-in">
      <div v-if="transmissionStatus === 'success' && !selectedBook" class="flex flex-col items-center justify-center py-20 text-center space-y-8">
        <div class="relative">
          <div class="absolute inset-0 bg-purple-500 rounded-full blur-3xl opacity-20 animate-transmit-ping" />
          <div class="w-32 h-32 rounded-full bg-purple-600/10 border border-purple-500/30 flex items-center justify-center text-purple-500 z-10 relative">
            <CheckCircle :size="64" />
          </div>
        </div>
        <div class="space-y-2">
          <h2 class="text-4xl font-black uppercase tracking-tighter text-white">Transmission Locked</h2>
          <p class="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600">ARTIFACT LOGGED IN ARCHIVE PIPELINE</p>
        </div>
      </div>

      <div v-else class="space-y-12">
        <!-- Search Section -->
        <div class="space-y-6">
          <div class="flex flex-col gap-2">
            <h2 class="text-4xl font-black uppercase tracking-tighter text-white">Portal Inquiry</h2>
            <p class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">QUERYING GLOBAL ARCHIVE INDICES...</p>
          </div>
          
          <div class="relative group">
            <input 
              v-model="searchTerm"
              type="text" 
              placeholder="Title, ISBN, or Creator identifier..."
              class="w-full bg-neutral-900/40 backdrop-blur-xl border border-white/5 py-6 pl-16 pr-8 rounded-[32px] text-lg text-white placeholder-neutral-800 outline-none focus:border-purple-600/50 focus:ring-4 focus:ring-purple-600/5 transition-all shadow-2xl"
            />
            <Search class="absolute left-6 top-1/2 -translate-y-1/2 text-neutral-800 group-focus-within:text-purple-500 transition-colors" />
            <Loader2 v-if="isSearching" class="absolute right-8 top-1/2 -translate-y-1/2 text-purple-500 animate-spin" :size="20" />
          </div>

          <!-- Live Results Dropdown -->
          <Transition name="dropdown">
            <div v-if="searchResults.length > 0" class="absolute mt-3 w-full max-w-4xl bg-neutral-950/90 backdrop-blur-3xl border border-white/5 rounded-[32px] overflow-hidden z-[100] shadow-[0_40px_100px_rgba(0,0,0,0.9)]">
              <button 
                v-for="book in searchResults" 
                :key="book.id"
                @click="selectBook(book)"
                class="w-full flex items-center gap-6 p-5 border-b border-white/5 hover:bg-purple-600/10 transition-all text-left group"
              >
                <div class="w-14 h-20 bg-neutral-900 rounded-lg overflow-hidden shrink-0 shadow-lg border border-white/5">
                  <img 
                    v-if="book.volumeInfo.imageLinks?.thumbnail" 
                    :src="book.volumeInfo.imageLinks.thumbnail.replace('http:', 'https:')" 
                    class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                  />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <BookOpen :size="16" class="text-neutral-800" />
                  </div>
                </div>
                <div class="flex-1 overflow-hidden">
                  <h4 class="text-sm font-black text-white truncate uppercase tracking-tight">{{ book.volumeInfo.title }}</h4>
                  <p class="text-[10px] font-black text-neutral-600 truncate uppercase tracking-widest">{{ book.volumeInfo.authors?.join(', ') || 'Unknown Creator' }}</p>
                </div>
                <div class="p-3 rounded-full bg-neutral-900 text-neutral-600 group-hover:bg-purple-600 group-hover:text-white transition-all">
                  <Check v-if="selectedBook?.title === book.volumeInfo.title" :size="16" />
                  <Send v-else :size="16" />
                </div>
              </button>
            </div>
          </Transition>
        </div>

        <!-- Archive Review Form -->
        <Transition name="fade-pop">
          <div v-if="selectedBook" class="space-y-10">
            <div class="grid md:grid-cols-[260px_1fr] gap-10 bg-neutral-900/60 backdrop-blur-2xl rounded-[48px] p-8 md:p-12 border border-purple-500/20 relative overflow-hidden group shadow-2xl transition-all">
              <div class="absolute top-0 right-0 p-6">
                 <button @click="selectedBook = null" class="p-3 bg-neutral-950/80 rounded-full text-neutral-500 hover:text-white transition-all active:scale-90 border border-white/5">
                    <X :size="18" />
                 </button>
              </div>
              
              <!-- Review Visualization -->
              <div class="flex flex-col gap-6">
                <div class="aspect-[2/3] bg-neutral-950 rounded-[32px] overflow-hidden shadow-2xl border border-white/10 relative group-hover:scale-[1.03] transition-transform duration-700">
                  <img v-if="selectedBook.thumbnail" :src="selectedBook.thumbnail" class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full flex items-center justify-center">
                     <BookOpen :size="48" class="text-neutral-900" />
                  </div>
                </div>
                <div class="flex items-center gap-3 p-4 bg-neutral-950/60 rounded-2xl border border-white/5">
                  <Fingerprint :size="14" class="text-purple-500" />
                  <div class="flex flex-col">
                    <span class="text-[7px] font-black uppercase text-neutral-700 tracking-[0.1em]">Registry Key</span>
                    <span class="text-[9px] font-mono text-neutral-400">{{ selectedBook.isbn }}</span>
                  </div>
                </div>
              </div>

              <!-- Form Details -->
              <div class="flex flex-col justify-between pt-4">
                <div class="space-y-8">
                  <div class="space-y-1">
                    <p class="text-[9px] font-black uppercase tracking-[0.4em] text-purple-500/80">ARCHIVE REVIEW</p>
                    <h3 class="text-3xl font-black uppercase tracking-tighter text-white leading-tight">{{ selectedBook.title }}</h3>
                    <div class="flex items-center gap-2 text-neutral-500">
                      <User :size="12" />
                      <span class="text-[10px] font-black uppercase tracking-widest">{{ selectedBook.author }}</span>
                    </div>
                  </div>

                  <div class="space-y-3">
                    <div class="flex items-center gap-2 text-neutral-700">
                      <MessageSquare :size="12" />
                      <label class="text-[8px] font-black uppercase tracking-[0.4em]">Additional Directive</label>
                    </div>
                    <textarea 
                      v-model="userNote"
                      placeholder="Special instructions for artifact processing..."
                      class="w-full bg-black/40 border border-white/5 rounded-3xl p-6 text-sm text-neutral-300 outline-none focus:border-purple-600/30 transition-all min-h-[140px] resize-none placeholder:text-neutral-800"
                    ></textarea>
                  </div>
                </div>

                <div class="space-y-4 pt-8">
                  <div v-if="transmissionStatus === 'error'" class="flex items-center gap-2 text-red-500/80 bg-red-500/5 p-4 rounded-2xl border border-red-500/10 text-[10px] font-black uppercase tracking-widest">
                    <AlertTriangle :size="14" />
                    <span>{{ errorMsg }}</span>
                  </div>

                  <button 
                    @click="transmitRequest($event)"
                    :disabled="transmissionStatus === 'sending' || transmissionStatus === 'success'"
                    class="w-full py-6 rounded-3xl font-black text-xs uppercase tracking-[0.5em] transition-all flex items-center justify-center gap-4 group relative overflow-hidden"
                    :class="[
                      transmissionStatus === 'sending' 
                        ? 'bg-purple-900/50 text-purple-300 cursor-not-allowed' 
                        : transmissionStatus === 'success'
                        ? 'bg-purple-600 text-white shadow-[0_0_40px_rgba(168,85,247,0.6)]'
                        : 'gradient-aether text-white shadow-[0_20px_60px_rgba(168,85,247,0.3)] active:scale-[0.98]'
                    ]"
                  >
                    <div v-if="transmissionStatus === 'sending'" class="absolute inset-0 bg-purple-500/10 animate-pulse" />
                    
                    <template v-if="transmissionStatus === 'sending'">
                      <Loader2 class="animate-spin" :size="18" />
                      <span>Transmitting...</span>
                    </template>
                    <template v-else-if="transmissionStatus === 'success'">
                      <CheckCircle :size="18" />
                      <span>Request Sent</span>
                    </template>
                    <template v-else>
                      <Send :size="18" class="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      <span>Transmit Request</span>
                    </template>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.gradient-aether {
  background: linear-gradient(135deg, #A855F7 0%, #7E22CE 100%);
}

@keyframes transmit-ping {
  0% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(1.6); opacity: 0.1; }
  100% { transform: scale(2); opacity: 0; }
}

.animate-transmit-ping {
  animation: transmit-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}

.fade-pop-enter-active, .fade-pop-leave-active {
  transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.fade-pop-enter-from {
  opacity: 0;
  transform: scale(0.96) translateY(20px);
}
.fade-pop-leave-to {
  opacity: 0;
  transform: scale(1.04);
}

.dropdown-enter-active, .dropdown-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.dropdown-enter-from, .dropdown-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
