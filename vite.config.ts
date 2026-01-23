
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
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
