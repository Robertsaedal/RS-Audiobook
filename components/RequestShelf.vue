
<script setup lang="ts">
import { ref, watch } from 'vue';
import { Search, BookOpen, Send, CheckCircle, User, Fingerprint, MessageSquare, Loader2, X } from 'lucide-vue-next';

// Webhook Configuration - User can replace this with their actual Discord webhook
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1344405364409372723/hB3uP6h4mI3-9m2i_B1B8R6xP6j8t9_L1M2N3O4P5Q6R7S8T9U0V1W2X3Y4Z';

const searchTerm = ref('');
const searchResults = ref<any[]>([]);
const isSearching = ref(false);
const selectedBook = ref<any | null>(null);
const userNote = ref('');
const isTransmitting = ref(false);
const transmissionComplete = ref(false);

let debounceTimeout: any = null;

const searchBooks = async () => {
  if (!searchTerm.value || searchTerm.value.length < 3) {
    searchResults.value = [];
    return;
  }

  isSearching.ref = true;
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchTerm.value)}&maxResults=5`);
    const data = await res.json();
    searchResults.value = data.items || [];
  } catch (e) {
    console.error('Archive query failed', e);
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
    description: info.description || ''
  };
  searchTerm.value = '';
  searchResults.value = [];
};

const transmitRequest = async () => {
  if (!selectedBook.value) return;
  
  isTransmitting.value = true;
  
  const payload = {
    embeds: [{
      title: '📦 New Artifact Request',
      description: 'A user is requesting a new volume for the archive repository.',
      color: 10276539, // Purple (Aether style)
      fields: [
        { name: 'Artifact Title', value: selectedBook.value.title, inline: true },
        { name: 'Author', value: selectedBook.value.author, inline: true },
        { name: 'ISBN', value: selectedBook.value.isbn, inline: true },
        { name: 'User Note', value: userNote.value || 'No additional notes provided.' }
      ],
      thumbnail: {
        url: selectedBook.value.thumbnail || 'https://via.placeholder.com/150?text=No+Cover'
      },
      footer: {
        text: 'R.S Archive Portal V5.2 • Automated Transmission'
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
      transmissionComplete.value = true;
      setTimeout(() => {
        reset();
      }, 5000);
    }
  } catch (e) {
    alert('Transmission link severed. Check portal logs.');
  } finally {
    isTransmitting.value = false;
  }
};

const reset = () => {
  selectedBook.value = null;
  userNote.value = '';
  transmissionComplete.value = false;
  searchTerm.value = '';
};
</script>

<template>
  <div class="max-w-4xl mx-auto pb-32">
    <Transition name="fade-pop" mode="out-in">
      <!-- Successful Transmission Screen -->
      <div v-if="transmissionComplete" class="flex flex-col items-center justify-center py-20 text-center space-y-8 animate-pulse-slow">
        <div class="relative">
          <div class="absolute inset-0 bg-purple-500 rounded-full blur-2xl opacity-20 animate-transmission-pulse" />
          <div class="w-32 h-32 rounded-full bg-purple-600/10 border border-purple-500/30 flex items-center justify-center text-purple-500 z-10 relative">
            <CheckCircle :size="64" />
          </div>
        </div>
        <div class="space-y-2">
          <h2 class="text-3xl font-black uppercase tracking-tighter text-white">Transmission Successful</h2>
          <p class="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600">ARTIFACT LOGGED IN ARCHIVE QUEUE</p>
        </div>
        <button @click="reset" class="px-8 py-3 rounded-full border border-white/5 bg-neutral-950 text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-white transition-all">Establish New Link</button>
      </div>

      <!-- Main Request Interface -->
      <div v-else class="space-y-12">
        <!-- Search Section -->
        <div class="relative">
          <div class="flex flex-col gap-2 mb-4">
            <h2 class="text-4xl font-black uppercase tracking-tighter text-white">Identify Artifact</h2>
            <p class="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-700">QUERYING GLOBAL REPOSITORIES...</p>
          </div>
          
          <div class="relative group">
            <input 
              v-model="searchTerm"
              type="text" 
              placeholder="Query artifact by title or ISBN..."
              class="w-full bg-neutral-900/40 backdrop-blur-xl border border-white/5 py-6 pl-16 pr-8 rounded-[32px] text-lg text-white placeholder-neutral-800 outline-none focus:border-purple-600/50 focus:ring-4 focus:ring-purple-600/10 transition-all shadow-2xl"
            />
            <Search class="absolute left-6 top-1/2 -translate-y-1/2 text-neutral-800 group-focus-within:text-purple-500 transition-colors" />
            <Loader2 v-if="isSearching" class="absolute right-8 top-1/2 -translate-y-1/2 text-purple-500 animate-spin" :size="20" />
          </div>

          <!-- Dropdown Results -->
          <Transition name="dropdown">
            <div v-if="searchResults.length > 0" class="absolute top-full left-0 right-0 mt-3 bg-neutral-950/90 backdrop-blur-3xl border border-white/5 rounded-[32px] overflow-hidden z-[100] shadow-[0_40px_100px_rgba(0,0,0,0.8)]">
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
                  <p class="text-[10px] font-black text-neutral-600 truncate uppercase tracking-widest">{{ book.volumeInfo.authors?.join(', ') || 'Unknown Author' }}</p>
                </div>
                <div class="p-3 rounded-full bg-neutral-900 text-neutral-600 group-hover:bg-purple-600 group-hover:text-white transition-all">
                  <PlusSquare :size="16" />
                </div>
              </button>
            </div>
          </Transition>
        </div>

        <!-- Form Section -->
        <Transition name="fade-pop">
          <div v-if="selectedBook" class="grid md:grid-cols-[280px_1fr] gap-10 bg-neutral-900/20 rounded-[48px] p-8 md:p-12 border border-white/5 relative overflow-hidden group">
            <div class="absolute top-0 right-0 p-4">
               <button @click="selectedBook = null" class="p-3 bg-neutral-900/80 rounded-full text-neutral-500 hover:text-white transition-colors">
                  <X :size="16" />
               </button>
            </div>
            
            <!-- Book Visualization -->
            <div class="flex flex-col gap-6">
              <div class="aspect-[2/3] bg-neutral-950 rounded-[32px] overflow-hidden shadow-2xl border border-white/10 relative group-hover:scale-[1.02] transition-transform duration-700">
                <img v-if="selectedBook.thumbnail" :src="selectedBook.thumbnail" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center">
                   <BookOpen :size="48" class="text-neutral-900" />
                </div>
              </div>
              <div class="space-y-4">
                <div class="flex items-center gap-3 p-4 bg-neutral-950/50 rounded-2xl border border-white/5">
                  <Fingerprint :size="16" class="text-purple-500" />
                  <div class="flex flex-col">
                    <span class="text-[7px] font-black uppercase text-neutral-700 tracking-[0.2em]">Unique Identifier</span>
                    <span class="text-[9px] font-mono text-neutral-300">{{ selectedBook.isbn }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Submission Form -->
            <div class="flex flex-col justify-between py-2">
              <div class="space-y-8">
                <div class="space-y-2">
                  <p class="text-[9px] font-black uppercase tracking-[0.4em] text-purple-600">ARTIFACT PREVIEW</p>
                  <h3 class="text-3xl font-black uppercase tracking-tighter text-white">{{ selectedBook.title }}</h3>
                  <div class="flex items-center gap-2 text-neutral-500">
                    <User :size="12" />
                    <span class="text-[10px] font-black uppercase tracking-widest">{{ selectedBook.author }}</span>
                  </div>
                </div>

                <div class="space-y-3">
                  <div class="flex items-center gap-2 text-neutral-700">
                    <MessageSquare :size="12" />
                    <label class="text-[8px] font-black uppercase tracking-[0.4em]">Additional Directives</label>
                  </div>
                  <textarea 
                    v-model="userNote"
                    placeholder="Enter special instructions or notes for the archivist..."
                    class="w-full bg-neutral-950/50 border border-white/5 rounded-3xl p-6 text-sm text-neutral-300 outline-none focus:border-purple-600/30 transition-all min-h-[140px] resize-none"
                  ></textarea>
                </div>
              </div>

              <button 
                @click="transmitRequest"
                :disabled="isTransmitting"
                class="mt-10 w-full gradient-aether py-6 rounded-3xl font-black text-xs uppercase tracking-[0.4em] shadow-[0_20px_50px_rgba(157,80,187,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-4 disabled:opacity-50"
              >
                <Loader2 v-if="isTransmitting" class="animate-spin" :size="16" />
                <Send v-else :size="16" />
                <span>Transmit to Archive</span>
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.animate-pulse-slow {
  animation: pulse-slow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse-slow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

@keyframes transmission-pulse {
  0% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.5); opacity: 0.1; }
  100% { transform: scale(1.8); opacity: 0; }
}

.animate-transmission-pulse {
  animation: transmission-pulse 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}

.fade-pop-enter-active, .fade-pop-leave-active {
  transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.fade-pop-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(20px);
}
.fade-pop-leave-to {
  opacity: 0;
  transform: scale(1.05);
}

.dropdown-enter-active, .dropdown-leave-active {
  transition: all 0.3s ease;
}
.dropdown-enter-from, .dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
