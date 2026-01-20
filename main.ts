import { createApp } from 'vue';
import App from './App.vue';
import './index.css';

// PWA: Capture install prompt immediately before app mounts
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  // Store the event globally so App.vue can access it later
  (window as any).deferredPrompt = e;
});

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

const app = createApp(App);
app.mount('#root');