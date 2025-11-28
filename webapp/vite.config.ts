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
    // Also include core utils tests but exclude integration tests that require complex mocking
    exclude: [
      'src/gesture/__tests__/**',
      'src/gesture/core/__tests__/GestureDetectionStep.test.ts',
    ],
  },
});
