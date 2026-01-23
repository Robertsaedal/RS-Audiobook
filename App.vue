
<script setup lang="ts">
import { ref, onMounted, onUnmounted, defineAsyncComponent, reactive } from 'vue';
import { AuthState, ABSLibraryItem, ABSProgress } from './types';
import { ABSService } from './services/absService';
import InstallPwaBanner from './components/InstallPwaBanner.vue';
import MiniPlayer from './components/MiniPlayer.vue';

const Login = defineAsyncComponent(() => import('./views/Login.vue'));
const Library = defineAsyncComponent(() => import('./views/Library.vue'));
const Player = defineAsyncComponent(() => import('./views/Player.vue'));

const currentView = ref<'login' | 'library' | 'player'>('login');
const auth = ref<AuthState | null>(null);
const selectedItem = ref<ABSLibraryItem | null>(null);
const isInitializing = ref(true);
const isStreaming = ref(false);
const initialSeriesId = ref<string | null>(null);
const showInfoOnOpen = ref(false);

const absService = ref<ABSService | null>(null);
const progressMap = reactive(new Map<string, ABSProgress>());

onMounted(() => {
  const savedAuth = localStorage.getItem('rs_auth');
  if (savedAuth) {
    auth.value = JSON.parse(savedAuth);
    currentView.value = 'library';
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
  auth.value = null;
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
        <Login v-if="currentView === 'login'" @login="auth = $event; currentView = 'library'" />
        <Library 
          v-else-if="currentView === 'library' && auth"
          :auth="auth" 
          :isStreaming="isStreaming"
          :progressMap="progressMap"
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
