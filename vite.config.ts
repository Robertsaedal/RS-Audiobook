
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  define: {
    // Provides a fallback for the Discord Webhook to prevent 'undefined' errors during transformation
    'process.env.VITE_DISCORD_WEBHOOK': JSON.stringify(process.env.VITE_DISCORD_WEBHOOK || '')
  },
  build: {
    target: 'esnext',
    sourcemap: false, // Critical: Disable for faster builds and lower memory usage on Vercel
    minify: 'esbuild',
    chunkSizeWarningLimit: 2000,
    reportCompressedSize: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-vue-next')) return 'ui-icons';
            if (id.includes('dexie') || id.includes('socket.io-client')) return 'db-core';
            return 'vendor';
          }
        }
      }
    }
  },
  optimizeDeps: {
    include: ['vue', 'dexie', 'lucide-vue-next', 'socket.io-client', 'canvas-confetti']
  }
});
