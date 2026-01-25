
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [vue()],
    build: {
      target: 'esnext',
      chunkSizeWarningLimit: 1000,
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          }
        }
      }
    },
    esbuild: {
      drop: ['console', 'debugger']
    },
    define: {
      // Polyfill process.env.API_KEY for the Gemini SDK
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      // Also expose standard process.env just in case other libs need it (safe fallback)
      'process.env': {}
    }
  };
});