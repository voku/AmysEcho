import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Include gesture tests (modelClient, installMlp) but exclude integration-style gesture tests
    exclude: [
      'src/gesture/__tests__/**',
      'src/gesture/core/__tests__/**',
      'src/gesture/utils/__tests__/**',
    ],
  },
});
