
<script setup lang="ts">
import { ref } from 'vue';
import { AuthState } from '../types';
import { ABSService } from '../services/absService';
import { ShieldAlert, Link as LinkIcon, User, Lock, Activity, Headphones } from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'login', auth: AuthState): void
}>();

const serverUrl = ref('https://api.robertsaedal.xyz');
const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const corsError = ref(false);

const handleSubmit = async () => {
  loading.value = true;
  error.value = null;
  corsError.value = false;

  try {
    const data = await ABSService.login(serverUrl.value, username.value, password.value);
    
    let finalUrl = serverUrl.value.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    if (!finalUrl.startsWith('http')) {
      finalUrl = `${window.location.protocol === 'https:' ? 'https://' : 'http://'}${finalUrl}`;
    }

    emit('login', {
      serverUrl: finalUrl,
      user: { 
        id: data.user.id, 
        username: data.user.username, 
        token: data.user.token 
      }
    });
  } catch (err: any) {
    if (err.message === 'CORS_ERROR') {
      corsError.value = true;
    } else {
      error.value = err.message || 'Access Denied: Check Credentials';
    }
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center p-8 bg-black h-[100dvh] overflow-hidden">
    <div class="w-full max-w-md space-y-12 animate-fade-in relative">
      <div class="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div class="text-center relative flex flex-col items-center">
        <div class="w-20 h-20 rounded-3xl overflow-hidden shadow-2xl mb-6 bg-neutral-900 border border-white/5 flex items-center justify-center relative">
          <img 
            src="/logo.png" 
            alt="R.S Audio Logo" 
            class="w-full h-full object-cover z-10" 
            @error="(e: any) => e.target.style.display = 'none'"
          />
          <Headphones :size="32" class="text-purple-500 absolute" />
        </div>
        <h1 class="text-3xl font-black tracking-tighter text-purple-500 mb-2 drop-shadow-aether-glow leading-tight">R.S AUDIOBOOK PLAYER</h1>
        <div class="flex items-center justify-center gap-2">
          <Activity :size="10" class="text-neutral-700" />
          <p class="text-neutral-700 uppercase tracking-[0.5em] text-[10px] font-black">Secure Link Portal</p>
        </div>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4 relative">
        <div class="relative group">
          <LinkIcon :size="14" class="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-800 group-focus-within:text-purple-500 transition-colors" />
          <input
            type="text"
            placeholder="SERVER ENDPOINT"
            v-model="serverUrl"
            class="w-full bg-neutral-900 border-none py-5 pl-14 pr-6 rounded-[24px] text-white placeholder-neutral-800 font-black text-xs tracking-widest outline-none focus:ring-1 focus:ring-purple-600/40 transition-all"
            required
          />
        </div>

        <div class="relative group">
          <User :size="14" class="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-800 group-focus-within:text-purple-500 transition-colors" />
          <input
            type="text"
            placeholder="USERNAME"
            v-model="username"
            class="w-full bg-neutral-900 border-none py-5 pl-14 pr-6 rounded-[24px] text-white placeholder-neutral-800 font-black text-xs tracking-widest outline-none focus:ring-1 focus:ring-purple-600/40 transition-all"
            required
          />
        </div>

        <div class="relative group">
          <Lock :size="14" class="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-800 group-focus-within:text-purple-500 transition-colors" />
          <input
            type="password"
            placeholder="PASSWORD"
            v-model="password"
            class="w-full bg-neutral-900 border-none py-5 pl-14 pr-6 rounded-[24px] text-white placeholder-neutral-800 font-black text-xs tracking-widest outline-none focus:ring-1 focus:ring-purple-600/40 transition-all"
            required
          />
        </div>

        <div v-if="error || corsError" class="bg-red-500/5 border border-red-500/20 p-6 rounded-[24px] text-center animate-shake">
          <div class="flex justify-center mb-2">
            <ShieldAlert :size="20" class="text-red-500" />
          </div>
          <div v-if="corsError" class="space-y-2">
            <p class="text-red-400 font-black uppercase text-[10px] tracking-widest">Connection Blocked (CORS)</p>
            <p class="text-neutral-500 text-[9px] leading-relaxed uppercase font-bold text-center">
              Add this origin to Audiobookshelf Allowed Origins:
              <br />
              <span class="text-purple-500 break-all mt-1 block font-mono">{{ window.location.origin }}</span>
            </p>
          </div>
          <div v-else class="text-red-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">
            {{ error }}
          </div>
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full gradient-aether py-6 rounded-[24px] font-black text-lg tracking-[0.2em] shadow-aether-glow active:scale-95 transition-all text-white mt-4 disabled:opacity-50 disabled:scale-100"
        >
          {{ loading ? 'AUTHENTICATING...' : 'CONNECT' }}
        </button>
      </form>

      <div class="text-center pt-8">
        <p class="text-[8px] font-black text-neutral-800 uppercase tracking-[0.4em]">Proprietary Archive Technology • V5.2</p>
      </div>
    </div>
  </div>
</template>
