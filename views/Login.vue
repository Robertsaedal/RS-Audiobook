
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { AuthState } from '../types';
import { ABSService } from '../services/absService';
import { Link as LinkIcon, User, Lock, Activity, AlertCircle } from 'lucide-vue-next';
import AppLogo from '../components/AppLogo.vue';

const emit = defineEmits<{
  (e: 'login', auth: AuthState): void
}>();

const serverUrl = ref('https://api.robertsaedal.xyz');
const username = ref('');
const password = ref('');
const processing = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  const savedAuth = localStorage.getItem('rs_auth');
  if (savedAuth) {
    try {
      const auth = JSON.parse(savedAuth) as AuthState;
      if (auth.user?.token) {
        processing.value = true;
        // Verify token and get fresh user data
        const authorizeRes = await ABSService.authorize(auth.serverUrl, auth.user.token);
        
        if (authorizeRes) {
          // Construct fresh auth state with latest data from server
          const freshAuth: AuthState = {
            serverUrl: auth.serverUrl,
            user: {
              id: authorizeRes.user.id,
              username: authorizeRes.user.username,
              token: auth.user.token, // Keep existing token
              mediaProgress: authorizeRes.user.mediaProgress || [],
              defaultLibraryId: authorizeRes.user.defaultLibraryId || auth.user.defaultLibraryId // Preserve or update
            }
          };

          // Update storage with fresh data
          localStorage.setItem('rs_auth', JSON.stringify(freshAuth));
          emit('login', freshAuth);
        }
      }
    } catch (e: any) {
      console.error('Auto-login check failed', e);
      localStorage.removeItem('rs_auth');
      error.value = e.message || 'Stored session invalid.';
    } finally {
      processing.value = false;
    }
  }
});

const submitForm = async () => {
  error.value = null;
  processing.value = true;

  try {
    const normalizedUrl = ABSService.normalizeUrl(serverUrl.value);
    const authRes = await ABSService.login(normalizedUrl, username.value, password.value);
    const token = authRes.user.accessToken || authRes.user.token;
    
    if (!token) {
      throw new Error('No access token received from portal.');
    }

    const authorizeRes = await ABSService.authorize(normalizedUrl, token);
    
    if (authorizeRes) {
      const authData: AuthState = {
        serverUrl: normalizedUrl,
        user: { 
          id: authorizeRes.user.id, 
          username: authorizeRes.user.username, 
          token: token,
          mediaProgress: authorizeRes.user.mediaProgress || [],
          // Capture defaultLibraryId from login response (authRes) or authorize response (if present)
          defaultLibraryId: authRes.userDefaultLibraryId || authorizeRes.user.defaultLibraryId
        }
      };

      localStorage.setItem('rs_auth', JSON.stringify(authData));
      emit('login', authData);
    }
  } catch (err: any) {
    console.error('Portal connection failed', err);
    error.value = err.message || 'Connection failed: Check URL and Credentials';
  } finally {
    processing.value = false;
  }
};
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center p-8 bg-black h-[100dvh] overflow-hidden relative">
    <div class="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[120px] animate-pulse" />
      <div class="absolute top-0 right-0 w-[300px] h-[300px] bg-purple-900/10 rounded-full blur-[80px]" />
    </div>

    <div class="w-full max-w-md space-y-10 animate-fade-in relative z-10">
      <div class="text-center flex flex-col items-center">
        <div class="mb-8 group">
          <AppLogo className="w-24 h-24" />
        </div>
        <h1 class="text-3xl font-black tracking-tighter text-white mb-2 leading-tight">
          ARCHIVE <span class="text-purple-500 drop-shadow-aether-glow">PORTAL</span>
        </h1>
        <div class="flex items-center justify-center gap-3">
          <Activity :size="10" class="text-purple-600 animate-pulse" />
          <p class="text-neutral-600 uppercase tracking-[0.6em] text-[9px] font-black">Secure Endpoint Authorized</p>
        </div>
      </div>

      <div class="bg-neutral-900/40 backdrop-blur-2xl border border-purple-500/30 rounded-[40px] p-8 shadow-2xl relative overflow-hidden group">
        <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        <div v-if="error" class="flex items-center gap-3 text-red-400 text-center py-4 px-4 mb-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest animate-shake">
          <AlertCircle :size="14" class="shrink-0" />
          <span>{{ error }}</span>
        </div>

        <form @submit.prevent="submitForm" class="space-y-5">
          <div class="space-y-1.5">
            <label class="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em] ml-5">Portal Address</label>
            <div class="relative group">
              <LinkIcon :size="14" class="absolute left-6 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-purple-500 transition-colors" />
              <input
                type="text"
                v-model="serverUrl"
                :disabled="processing"
                placeholder="https://your-server.xyz"
                class="w-full bg-neutral-900/80 border border-white/10 py-5 pl-14 pr-8 rounded-[24px] text-white placeholder-neutral-700 font-bold text-xs tracking-tight outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all disabled:opacity-50"
                required
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em] ml-5">Identifier</label>
            <div class="relative group">
              <User :size="14" class="absolute left-6 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-purple-500 transition-colors" />
              <input
                type="text"
                v-model="username"
                :disabled="processing"
                placeholder="Username"
                class="w-full bg-neutral-900/80 border border-white/10 py-5 pl-14 pr-8 rounded-[24px] text-white placeholder-neutral-700 font-bold text-xs tracking-tight outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all disabled:opacity-50"
                required
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em] ml-5">Passkey</label>
            <div class="relative group">
              <Lock :size="14" class="absolute left-6 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-purple-500 transition-colors" />
              <input
                type="password"
                v-model="password"
                :disabled="processing"
                placeholder="Password"
                class="w-full bg-neutral-900/80 border border-white/10 py-5 pl-14 pr-8 rounded-[24px] text-white placeholder-neutral-700 font-bold text-xs tracking-tight outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            :disabled="processing"
            class="w-full gradient-aether py-6 rounded-[28px] font-black text-sm uppercase tracking-[0.3em] shadow-[0_10px_30px_rgba(157,80,187,0.4)] active:scale-[0.98] transition-all text-white mt-8 disabled:opacity-50 disabled:grayscale disabled:scale-100 flex items-center justify-center gap-3 overflow-hidden"
          >
            <span v-if="processing" class="flex items-center gap-2">
              <div class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              CHECKING...
            </span>
            <span v-else>INITIALIZE LINK</span>
          </button>
        </form>
      </div>

      <div class="text-center pt-6 opacity-30">
        <p class="text-[8px] font-black text-neutral-400 uppercase tracking-[0.5em]">Premium Minimalism • Archive Client v5.3</p>
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
.animate-fade-in {
  animation: fade-in 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
