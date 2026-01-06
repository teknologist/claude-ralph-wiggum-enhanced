import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { resolve } from 'path';
import istanbulPlugin from 'vite-plugin-istanbul';

// Conditionally add coverage plugin for E2E tests
const isCoverage = process.env.COVERAGE === 'true';

export default defineConfig({
  plugins: [
    react(),
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
      bundleName: 'ralph-dashboard',
      uploadToken: process.env.CODECOV_TOKEN,
    }),
    // Add Istanbul instrumentation for E2E tests when COVERAGE=true
    ...(isCoverage
      ? [
          istanbulPlugin({
            include: ['src/**', 'server/**'],
            exclude: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
            extension: ['.js', '.jsx', '.ts', '.tsx'],
            forceBuildInstrument: true,
            cypress: false,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Add source maps for coverage (only when COVERAGE=true)
    sourcemap: isCoverage ? 'inline' : false,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3847',
        changeOrigin: true,
      },
    },
  },
});
