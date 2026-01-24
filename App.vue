
<script setup lang="ts">
import { ref, onMounted, onUnmounted, defineAsyncComponent, computed, reactive, watch } from 'vue';
import { AuthState, ABSLibraryItem, ABSProgress } from './types';
import { ABSService } from './services/absService';
import InstallPwaBanner from './components/InstallPwaBanner.vue';
import MiniPlayer from './components/MiniPlayer.vue';

// Dynamic Imports for Route-Based Code Splitting
const Login = defineAsyncComponent(() => import('./views/Login.vue'));
const Library = defineAsyncComponent(() => import('./views/Library.vue'));
const Player = defineAsyncComponent(() => import('./views/Player.vue'));

const currentView = ref<'login' | 'library' | 'player'>('login');
const auth = ref<AuthState | null>(null);
const selectedItem = ref<ABSLibraryItem | null>(null);
const isInitializing = ref(true);
const isStreaming = ref(false);
const initialSeriesId = ref<string | null>(null);

// Global ABS Service & Progress State
const absService = ref<ABSService | null>(null);
const progressMap = reactive(new Map<string, ABSProgress>());
const progressTick = ref(0); // Forces UI updates on progress change

// PWA State
const deferredPrompt = ref<any>(null);
const showPwaBanner = ref(false);
const isIOS = ref(false);

const handlePopState = (event: PopStateEvent) => {
  const hash = window.location.hash;
  
  // Player View Logic: If hash indicates player, force player view
  if (hash.startsWith('#player')) {
    if (currentView.value !== 'player') {
      currentView.value = 'player';
    }
  } else {
    // If hash is NOT player (e.g. empty, #series, #info), revert to Library
    if (currentView.value === 'player') {
      currentView.value = 'library';
    }
  }
};

const handleInstallPrompt = (e: Event) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt.value = e;
  
  // Check if user has dismissed it recently
  const dismissed = localStorage.getItem('rs_pwa_dismissed');
  if (!dismissed) {
    showPwaBanner.value = true;
  }
};

const handleGlobalProgressSync = (event: Event) => {
  const customEvent = event as CustomEvent<ABSProgress>;
  const update = customEvent.detail;
  if (update && update.itemId) {
    const existing = progressMap.get(update.itemId);
    if (existing) {
      Object.assign(existing, update);
    } else {
      progressMap.set(update.itemId, update);
    }
    progressTick.value++;
    
    // Sync active item if matching
    if (selectedItem.value && selectedItem.value.id === update.itemId) {
       const updatedItem = { ...selectedItem.value };
       updatedItem.userProgress = update;
       if ((updatedItem as any).media?.userProgress) {
         (updatedItem as any).media.userProgress = update;
       }
       selectedItem.value = updatedItem;
    }
  }
};

const initAbsService = () => {
  if (!auth.value) return;
  
  // Initialize Service
  absService.value = new ABSService(auth.value.serverUrl, auth.value.user?.token || '');

  // 1. Progress Update Listener
  absService.value.onProgressUpdate((update: ABSProgress) => {
    // Dispatch as local event to reuse logic
    window.dispatchEvent(new CustomEvent('rs-progress-sync', { detail: update }));
  });

  // 2. Init / User Items Listener (Force Refresh Response)
  absService.value.onInit((data: any) => {
    if (data.user && data.user.mediaProgress) {
      data.user.mediaProgress.forEach((p: any) => {
        const update: ABSProgress = {
          itemId: p.libraryItemId,
          currentTime: p.currentTime,
          duration: p.duration,
          progress: p.progress,
          isFinished: p.isFinished,
          lastUpdate: p.lastUpdate,
          hideFromContinueListening: p.hideFromContinueListening
        };
        progressMap.set(update.itemId, update);
      });
      progressTick.value++;
    }
  });

  // 3. User Online (Session Sync)
  absService.value.onUserOnline((update: any) => {
     // Ensure it's treated as a progress update
     const p = update as ABSProgress;
     if (p && p.itemId) {
        window.dispatchEvent(new CustomEvent('rs-progress-sync', { detail: p }));
     }
  });
};

onMounted(() => {
  // Check auth
  const savedAuth = localStorage.getItem('rs_auth');
  if (savedAuth) {
    try {
      auth.value = JSON.parse(savedAuth);
      currentView.value = 'library';
      initAbsService();
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
  
  // Check for existing deferred prompt (captured in main.ts)
  const earlyPrompt = (window as any).deferredPrompt;
  if (earlyPrompt) {
    handleInstallPrompt(earlyPrompt);
    (window as any).deferredPrompt = null;
  }

  // IOS Banner Logic (No event, just timeout)
  if (isIosDevice && !isStandalone && !localStorage.getItem('rs_pwa_dismissed')) {
    setTimeout(() => {
      showPwaBanner.value = true;
    }, 3000);
  }

  window.addEventListener('popstate', handlePopState);
  window.addEventListener('beforeinstallprompt', handleInstallPrompt);
  window.addEventListener('rs-progress-sync', handleGlobalProgressSync);
});

onUnmounted(() => {
  window.removeEventListener('popstate', handlePopState);
  window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
  window.removeEventListener('rs-progress-sync', handleGlobalProgressSync);
  absService.value?.disconnect();
});

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
  initAbsService();
};

const handleLogout = () => {
  auth.value = null;
  absService.value?.disconnect();
  absService.value = null;
  progressMap.clear();
  localStorage.removeItem('rs_auth');
  currentView.value = 'login';
};

const openPlayer = (item: ABSLibraryItem) => {
  selectedItem.value = item;
  isStreaming.value = true;
  
  // Push history state so back button closes player instead of app
  if (window.location.hash !== '#player') {
    window.history.pushState({ view: 'player' }, '', '#player');
  }
  currentView.value = 'player';
};

const expandMiniPlayer = () => {
  if (currentView.value !== 'player') {
    window.history.pushState({ view: 'player' }, '', '#player');
    currentView.value = 'player';
  }
};

const handleSelectSeriesFromPlayer = (seriesId: string) => {
  initialSeriesId.value = seriesId;
  // Race Condition Fix: Force reset URL history stack to clean slate to avoid 'Back' button traps
  // This removes #player or #player-info from history stack effectively
  window.history.replaceState({ view: 'library' }, '', window.location.pathname);
  currentView.value = 'library';
};

const handleItemUpdated = (updatedItem: ABSLibraryItem) => {
  selectedItem.value = updatedItem;
};

const closePlayer = (shouldPopState = true) => {
  // If we are currently at #player or a sub-route of player, pop it
  if (shouldPopState && window.location.hash.startsWith('#player')) {
    window.history.back(); 
  } else {
    currentView.value = 'library';
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
        
        <!-- Use KeepAlive to maintain Library state/scroll position and avoid re-fetching -->
        <KeepAlive include="Library" v-else-if="currentView === 'library' && auth">
          <Library 
            :auth="auth" 
            :isStreaming="isStreaming"
            :initialSeriesId="initialSeriesId"
            :progressMap="progressMap"
            :progressTick="progressTick"
            :providedService="absService"
            @select-item="openPlayer" 
            @logout="handleLogout" 
            @clear-initial-series="initialSeriesId = null"
          />
        </KeepAlive>
        
        <Player 
          v-else-if="currentView === 'player' && auth && selectedItem" 
          :auth="auth" 
          :item="selectedItem" 
          @back="closePlayer" 
          @select-series="handleSelectSeriesFromPlayer"
          @item-updated="handleItemUpdated"
        />
      </Transition>

      <!-- Persistent Mini Player -->
      <MiniPlayer 
        v-if="currentView !== 'player'"
        :auth="auth"
        @expand="expandMiniPlayer" 
      />

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
