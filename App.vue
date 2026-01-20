<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { AuthState, ABSLibraryItem } from './types';
import Login from './components/Login.vue';
import Library from './components/Library.vue';
import Player from './components/Player.vue';

const currentView = ref<'login' | 'library' | 'player'>('login');
const auth = ref<AuthState | null>(null);
const selectedItem = ref<ABSLibraryItem | null>(null);
const isInitializing = ref(true);
const isStreaming = ref(false);
const initialSeriesId = ref<string | null>(null);

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
  window.addEventListener('popstate', handlePopState);
});

onUnmounted(() => {
  window.removeEventListener('popstate', handlePopState);
});

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
  // Push state to trap mobile back button
  history.pushState({ player: true }, '', '#player');
};

const handleSelectSeriesFromPlayer = (seriesId: string) => {
  initialSeriesId.value = seriesId;
  closePlayer(true);
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
        />
      </Transition>
    </template>
  </div>
</template>

<style>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>