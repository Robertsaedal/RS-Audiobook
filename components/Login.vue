
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { AuthState } from '../types';
import { ABSService } from '../services/absService';
import { ShieldAlert, Link as LinkIcon, User, Lock, Activity, Headphones } from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'login', auth: AuthState): void
}>();

const serverUrl = ref('https://api.robertsaedal.xyz');
const username = ref('');
const password = ref('');
const processing = ref(false);
const error = ref<string | null>(null);

/**
 * Handle initial authorization check if token exists
 */
onMounted(async () => {
  const savedAuth = localStorage.getItem('rs_auth');
  if (savedAuth) {
    try {
      const auth = JSON.parse(savedAuth) as AuthState;
      if (auth.user?.token) {
        processing.value = true;
        const authorizeRes = await ABSService.authorize(auth.serverUrl, auth.user.token);
        if (authorizeRes) {
          emit('login', auth);
        }
      }
    } catch (e) {
      console.error('Auto-login check failed', e);
      localStorage.removeItem('rs_auth');
    } finally {
      processing.value = false;
    }
  }
});

/**
 * Official Login Pattern Implementation
 */
const submitForm = async () => {
  error.value = null;
  processing.value = true;

  try {
    // 1. Authenticate / Login
    const authRes = await ABSService.login(serverUrl.value, username.value, password.value);
    
    // Official code handles re-login flags here, we prioritize the token
    const token = authRes.user.accessToken || authRes.user.token;
    
    if (!token) {
      throw new Error('No access token received from portal.');
    }

    // 2. Authorize
    const authorizeRes = await ABSService.authorize(serverUrl.value, token);
    
    if (authorizeRes) {
      const finalUrl = serverUrl.value.trim().replace(/\/+$/, '').replace(/\/api$/, '');
      const authData: AuthState = {
        serverUrl: finalUrl,
        user: { 
          id: authorizeRes.user.id, 
          username: authorizeRes.user.username, 
          token: token
        }
      };

      // 3. Persist and Emit
      localStorage.setItem('rs_auth', JSON.stringify(authData));
      emit('login', authData);
    }
  } catch (err: any) {
    console.error('Portal connection failed', err);
    // Display error message from server exactly like official pattern
    error.value = err.message || 'Unknown Archive Error';
  } finally {
    processing.value = false;
  }
};
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center p-8 bg-black h-[100dvh] overflow-hidden">
    <!-- Ambient Background Glow -->
    <div class="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[120px]" />
    </div>

    <div class="w-full max-w-md space-y-10 animate-fade-in relative z-10">
      <!-- Logo Header -->
      <div class="text-center flex flex-col items-center">
        <div class="w-24 h-24 rounded-[32px] overflow-hidden shadow-[0_0_50px_rgba(157,80,187,0.2)] mb-8 bg-neutral-900 border border-purple-500/20 flex items-center justify-center group">
          <img 
            src="/logo.png" 
            alt="R.S Archive" 
            class="w-full h-full object-cover transition-transform group-hover:scale-110 duration-700"
            @error="(e: any) => e.target.style.display = 'none'"
          />
          <Headphones :size="40" class="text-purple-500 absolute drop-shadow-[0_0_10px_rgba(157,80,187,0.5)]" />
        </div>
        <h1 class="text-3xl font-black tracking-tighter text-white mb-2 leading-tight">
          ARCHIVE <span class="text-purple-500 drop-shadow-aether-glow">PORTAL</span>
        </h1>
        <div class="flex items-center justify-center gap-3">
          <Activity :size="10" class="text-purple-600 animate-pulse" />
          <p class="text-neutral-600 uppercase tracking-[0.6em] text-[9px] font-black">Secure Endpoint Authorized</p>
        </div>
      </div>

      <!-- Main Login Card -->
      <div class="bg-neutral-950/40 backdrop-blur-2xl border border-purple-500/20 rounded-[40px] p-8 shadow-2xl relative overflow-hidden group">
        <div class="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        <p v-if="error" class="text-red-500 text-center py-4 mb-4 bg-red-500/5 border border-red-500/10 rounded-2xl text-[10px] font-black uppercase tracking-widest animate-shake">
          {{ error }}
        </p>

        <form @submit.prevent="submitForm" class="space-y-4">
          <!-- Server Endpoint -->
          <div class="space-y-1.5">
            <label class="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em] ml-5">Portal Address</label>
            <div class="relative group">
              <LinkIcon :size="14" class="absolute left-6 top-1/2 -translate-y-1/2 text-neutral-700 group-focus-within:text-purple-500 transition-colors" />
              <input
                type="text"
                v-model="serverUrl"
                :disabled="processing"
                class="w-full bg-neutral-900 border border-white/5 py-5 pl-14 pr-8 rounded-[24px] text-white placeholder-neutral-700 font-bold text-xs tracking-tight outline-none focus:border-purple-500/30 transition-all disabled:opacity-50"
                required
              />
            </div>
          </div>

          <!-- Username -->
          <div class="space-y-1.5">
            <label class="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em] ml-5">Identifier</label>
            <div class="relative group">
              <User :size="14" class="absolute left-6 top-1/2 -translate-y-1/2 text-neutral-700 group-focus-within:text-purple-500 transition-colors" />
              <input
                type="text"
                v-model="username"
                :disabled="processing"
                class="w-full bg-neutral-900 border border-white/5 py-5 pl-14 pr-8 rounded-[24px] text-white placeholder-neutral-700 font-bold text-xs tracking-tight outline-none focus:border-purple-500/30 transition-all disabled:opacity-50"
                required
              />
            </div>
          </div>

          <!-- Password -->
          <div class="space-y-1.5">
            <label class="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em] ml-5">Passkey</label>
            <div class="relative group">
              <Lock :size="14" class="absolute left-6 top-1/2 -translate-y-1/2 text-neutral-700 group-focus-within:text-purple-500 transition-colors" />
              <input
                type="password"
                v-model="password"
                :disabled="processing"
                class="w-full bg-neutral-900 border border-white/5 py-5 pl-14 pr-8 rounded-[24px] text-white placeholder-neutral-700 font-bold text-xs tracking-tight outline-none focus:border-purple-500/30 transition-all disabled:opacity-50"
              />
            </div>
          </div>

          <!-- Action Button -->
          <button
            type="submit"
            :disabled="processing"
            class="w-full gradient-aether py-6 rounded-[28px] font-black text-sm uppercase tracking-[0.3em] shadow-[0_10px_30px_rgba(157,80,187,0.3)] active:scale-[0.98] transition-all text-white mt-8 disabled:opacity-50 disabled:grayscale disabled:scale-100 flex items-center justify-center gap-3 overflow-hidden"
          >
            <span v-if="processing" class="flex items-center gap-2">
              <div class="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              CHECKING...
            </span>
            <span v-else>INITIALIZE LINK</span>
          </button>
        </form>
      </div>

      <!-- Footer Info -->
      <div class="text-center pt-6 opacity-40">
        <p class="text-[8px] font-black text-neutral-400 uppercase tracking-[0.5em]">Premium Minimalism • Archive Client v5.2</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-shake {
  animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
}

@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}
</style>
