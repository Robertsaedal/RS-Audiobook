
<script setup lang="ts">
import { ref, onMounted, defineAsyncComponent, reactive, watch } from 'vue';
import { AuthState, ABSLibraryItem, ABSProgress } from './types';
import { ABSService } from './services/absService';
import MiniPlayer from './components/MiniPlayer.vue';

const Login = defineAsyncComponent(() => import('./views/Login.vue'));
const Library = defineAsyncComponent(() => import('./views/Library.vue'));
const Player = defineAsyncComponent(() => import('./views/Player.vue'));

const currentView = ref<'login' | 'library' | 'player'>('login');
const auth = ref<AuthState | null>(null);
const selectedItem = ref<ABSLibraryItem | null>(null);
const isInitializing = ref(true);
const isStreaming = ref(false);
const showInfoOnOpen = ref(false);

const absService = ref<ABSService | null>(null);
const progressMap = reactive(new Map<string, ABSProgress>());

// Global handler for successful authentication
const handleAuthSuccess = async (authState: AuthState) => {
  auth.value = authState;
  
  // Initialize or update ABSService
  const service = new ABSService(
    authState.serverUrl, 
    authState.user?.token || '',
    authState.user?.id,
    authState.user?.defaultLibraryId
  );
  
  // Discover and set default library if missing
  if (!service.libraryId) {
    await service.getLibraries();
    if (service.libraryId && auth.value.user) {
      auth.value.user.defaultLibraryId = service.libraryId;
      localStorage.setItem('rs_auth', JSON.stringify(auth.value));
    }
  }

  absService.value = service;
  currentView.value = 'library';
};

onMounted(async () => {
  const savedAuth = localStorage.getItem('rs_auth');
  if (savedAuth) {
    try {
      const parsedAuth = JSON.parse(savedAuth) as AuthState;
      await handleAuthSuccess(parsedAuth);
    } catch (e) {
      console.error('Session restoration failed', e);
      handleLogout();
    }
  }
  isInitializing.value = false;
});

const openPlayer = (item: ABSLibraryItem, showInfo = false) => {
  selectedItem.value = item;
  showInfoOnOpen.value = showInfo;
  currentView.value = 'player';
  isStreaming.value = true;
  history.pushState({ player: true }, '', '#player');
};

const handleLogout = () => {
  if (absService.value) {
    absService.value.disconnect();
  }
  auth.value = null;
  absService.value = null;
  localStorage.removeItem('rs_auth');
  currentView.value = 'login';
};

const closePlayer = () => {
  currentView.value = 'library';
  showInfoOnOpen.value = false;
};
</script>

<template>
  <div class="min-h-screen bg-[#0d0d0d] text-white flex flex-col font-sans overflow-hidden">
    <div v-if="isInitializing" class="fixed inset-0 bg-[#0d0d0d] flex flex-col items-center justify-center z-[200]">
      <div class="w-16 h-16 border-4 border-t-purple-600 rounded-full animate-spin" />
    </div>

    <template v-else>
      <Transition name="fade" mode="out-in">
        <Login v-if="currentView === 'login'" @login="handleAuthSuccess" />
        <Library 
          v-else-if="currentView === 'library' && auth && absService"
          :auth="auth" 
          :isStreaming="isStreaming"
          :progressMap="progressMap"
          :providedService="absService"
          @select-item="openPlayer($event, false)" 
          @open-info="openPlayer($event, true)"
          @logout="handleLogout" 
        />
        <Player 
          v-else-if="currentView === 'player' && auth && selectedItem" 
          :auth="auth" 
          :item="selectedItem" 
          :showInfoInitially="showInfoOnOpen"
          @back="closePlayer" 
        />
      </Transition>

      <MiniPlayer v-if="currentView !== 'player'" :auth="auth" @expand="currentView = 'player'" />
    </template>
  </div>
</template>
