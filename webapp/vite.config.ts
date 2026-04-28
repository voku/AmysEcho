import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

function resolveCommitHash(): string {
  const envHash = process.env.VITE_APP_COMMIT_SHA?.trim();
  if (envHash) {
    return envHash;
  }

  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unbekannt';
  }
}

const appCommitHash = resolveCommitHash();

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_COMMIT_SHA': JSON.stringify(appCommitHash),
  },
  // Base path for GitHub Pages deployment (repository name)
  // Set to '/' for custom domain or local development
  base: process.env.VITE_BASE_PATH || '/AmysEcho/',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('@mediapipe')) {
            return 'vendor-mediapipe';
          }

          if (id.includes('react') || id.includes('scheduler')) {
            return 'vendor-react';
          }

          return 'vendor';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/setupTests.ts',
    globalSetup: './src/testGlobalSetup.ts',
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        statements: 68,
        branches: 57,
        functions: 70,
        lines: 70,
      },
    },
  },
});
