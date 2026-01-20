<script setup lang="ts">
import { ref, onMounted, onUnmounted, defineAsyncComponent } from 'vue';
import { AuthState, ABSLibraryItem } from './types';
import InstallPwaBanner from './components/InstallPwaBanner.vue';

// Dynamic Imports for Route-Based Code Splitting
// This ensures the heavy Player or Library logic doesn't slow down the initial load.
const Login = defineAsyncComponent(() => import('./views/Login.vue'));
const Library = defineAsyncComponent(() => import('./views/Library.vue'));
const Player = defineAsyncComponent(() => import('./views/Player.vue'));

const currentView = ref<'login' | 'library' | 'player'>('login');
const auth = ref<AuthState | null>(null);
const selectedItem = ref<ABSLibraryItem | null>(null);
const isInitializing = ref(true);
const isStreaming = ref(false);
const initialSeriesId = ref<string | null>(null);

// PWA State
const deferredPrompt = ref<any>(null);
const showPwaBanner = ref(false);
const isIOS = ref(false);

const handlePopState = (event: PopStateEvent) => {
  if (currentView.value === 'player') {
    closePlayer(false); // Close without pushing state
  }
};

onMounted(() => {
  const savedAuth = localStorage.getItem('rs_auth');
  if (savedAuth) {
    try {
      auth.value = JSON.parse(savedAuth);
      currentView.value = 'library';
    } catch (e) {
      localStorage.removeItem('rs_auth');
    }
  }
  isInitializing.value = false;

  // Device & PWA Detection
  const ua = window.navigator.userAgent;
  const isIosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  isIOS.value = isIosDevice;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  const dismissed = localStorage.getItem('rs_pwa_dismissed');

  if (!isStandalone && !dismissed) {
    if (isIosDevice) {
      // iOS doesn't support beforeinstallprompt, show immediately if not dismissed
      setTimeout(() => {
        showPwaBanner.value = true;
      }, 2000);
    } else {
      // Android/Desktop: Check if event was already captured in main.ts
      const earlyPrompt = (window as any).deferredPrompt;
      if (earlyPrompt) {
        deferredPrompt.value = earlyPrompt;
        showPwaBanner.value = true;
        (window as any).deferredPrompt = null; // Clear global
      }
    }
  }

  window.addEventListener('popstate', handlePopState);
  window.addEventListener('beforeinstallprompt', handleInstallPrompt);
});

onUnmounted(() => {
  window.removeEventListener('popstate', handlePopState);
  window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
});

const handleInstallPrompt = (e: Event) => {
  e.preventDefault();
  const dismissed = localStorage.getItem('rs_pwa_dismissed');
  if (!dismissed) {
    deferredPrompt.value = e;
    showPwaBanner.value = true;
  }
};

const installApp = async () => {
  if (!deferredPrompt.value) return;
  deferredPrompt.value.prompt();
  const { outcome } = await deferredPrompt.value.userChoice;
  if (outcome === 'accepted') {
    showPwaBanner.value = false;
  }
  deferredPrompt.value = null;
};

const dismissInstall = () => {
  showPwaBanner.value = false;
  localStorage.setItem('rs_pwa_dismissed', 'true');
  deferredPrompt.value = null;
};

const handleLogin = (newAuth: AuthState) => {
  auth.value = newAuth;
  localStorage.setItem('rs_auth', JSON.stringify(newAuth));
  currentView.value = 'library';
};

const handleLogout = () => {
  auth.value = null;
  localStorage.removeItem('rs_auth');
  currentView.value = 'login';
};

const openPlayer = (item: ABSLibraryItem) => {
  selectedItem.value = item;
  currentView.value = 'player';
  isStreaming.value = true;
  history.pushState({ player: true }, '', '#player');
};

const handleSelectSeriesFromPlayer = (seriesId: string) => {
  initialSeriesId.value = seriesId;
  closePlayer(true);
};

const handleItemUpdated = (updatedItem: ABSLibraryItem) => {
  selectedItem.value = updatedItem;
};

const closePlayer = (shouldPopState = true) => {
  currentView.value = 'library';
  if (shouldPopState && window.location.hash === '#player') {
    history.back();
  }
};
</script>

<template>
  <div class="min-h-screen bg-[#0d0d0d] text-white selection:bg-purple-900 flex flex-col font-sans overflow-hidden">
    <!-- Loader -->
    <div v-if="isInitializing" class="fixed inset-0 bg-[#0d0d0d] flex flex-col items-center justify-center gap-6 z-[200]">
      <div class="w-16 h-16 border-4 border-purple-600/10 border-t-purple-600 rounded-full animate-spin" />
      <h2 class="font-black text-purple-500 tracking-[0.6em] text-[10px] uppercase">R.S ARCHIVE</h2>
    </div>

    <template v-else>
      <Transition name="fade" mode="out-in">
        <Login v-if="currentView === 'login'" @login="handleLogin" />
        <Library 
          v-else-if="currentView === 'library' && auth" 
          :auth="auth" 
          :isStreaming="isStreaming"
          :initialSeriesId="initialSeriesId"
          @select-item="openPlayer" 
          @logout="handleLogout" 
          @clear-initial-series="initialSeriesId = null"
        />
        <Player 
          v-else-if="currentView === 'player' && auth && selectedItem" 
          :auth="auth" 
          :item="selectedItem" 
          @back="closePlayer" 
          @select-series="handleSelectSeriesFromPlayer"
          @item-updated="handleItemUpdated"
        />
      </Transition>

      <InstallPwaBanner 
        :show="showPwaBanner" 
        :isIOS="isIOS"
        @install="installApp" 
        @dismiss="dismissInstall" 
      />
    </template>
  </div>
</template>

<style>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>