
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fix: Use @vitejs/plugin-react for .tsx files as the codebase is built with React.
export default defineConfig({
  plugins: [react()],
});
