import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Ensure newer ArrayBuffer/SharedArrayBuffer flags exist before Vitest spins up jsdom.
if (typeof ArrayBuffer !== 'undefined' && !Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')) {
  Object.defineProperty(ArrayBuffer.prototype, 'resizable', { get: () => false });
}

if (typeof SharedArrayBuffer !== 'undefined' && !Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'growable')) {
  Object.defineProperty(SharedArrayBuffer.prototype, 'growable', { get: () => false });
}

export default defineConfig({
  plugins: [react()],
  // Base path for GitHub Pages deployment (repository name)
  // Set to '/' for custom domain or local development
  base: process.env.VITE_BASE_PATH || '/AmysEcho/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/setupTests.ts',
    globalSetup: './src/testGlobalSetup.ts',
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
