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

// PWA State
const deferredPrompt = ref<any>(null);
const showPwaBanner = ref(false);
const isIOS = ref(false);

const handlePopState = (event: PopStateEvent) => {
  if (currentView.value === 'player') {
    closePlayer(false); // Close without pushing state
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

const initAbsService = () => {
  if (!auth.value) return;
  
  // Initialize Service
  absService.value = new ABSService(auth.value.serverUrl, auth.value.user?.token || '');

  // 1. Progress Update Listener
  absService.value.onProgressUpdate((update: ABSProgress) => {
    // Update Global Map
    const existing = progressMap.get(update.itemId);
    if (existing) {
      Object.assign(existing, update);
    } else {
      progressMap.set(update.itemId, update);
    }

    // Global Sync: Update Active Player Item if matching
    if (selectedItem.value && selectedItem.value.id === update.itemId) {
      // Create a shallow copy to trigger reactivity in Player/MiniPlayer
      const updatedItem = { ...selectedItem.value };
      updatedItem.userProgress = update;
      
      // Also update nested media progress if it exists structure-wise
      if ((updatedItem as any).media?.userProgress) {
        (updatedItem as any).media.userProgress = update;
      }
      
      selectedItem.value = updatedItem;
    }
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
    }
  });

  // 3. User Online (Session Sync)
  absService.value.onUserOnline((update: any) => {
     // Ensure it's treated as a progress update
     const p = update as ABSProgress;
     if (p && p.itemId) {
        progressMap.set(p.itemId, p);
        if (selectedItem.value && selectedItem.value.id === p.itemId) {
           selectedItem.value = { ...selectedItem.value, userProgress: p };
        }
     }
  });

  // Initial Fetch of all progress to populate stats and resume points
  absService.value.getAllUserProgress().then(items => {
      items.forEach(p => {
          progressMap.set(p.itemId, p);
      });
  });
};

onMounted(() => {
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
});

onUnmounted(() => {
  window.removeEventListener('popstate', handlePopState);
  window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
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
  currentView.value = 'player';
  isStreaming.value = true;
  history.pushState({ player: true }, '', '#player');
};

const expandMiniPlayer = () => {
  if (currentView.value !== 'player') {
    currentView.value = 'player';
    history.pushState({ player: true }, '', '#player');
  }
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
  <div class="min-h-screen bg-[#0d0d0d] bg-noise text-white selection:bg-purple-900 flex flex-col font-sans overflow-hidden">
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