import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@server': resolve(__dirname, './server'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    reporters: ['default', ['junit', { outputFile: 'test-report.junit.xml' }]],
    include: [
      'src/**/*.test.{ts,tsx}',
      'server/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary', 'json'],
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/setup.ts',
        '**/*.d.ts',
        // Exclude entry points that are covered by e2e tests, not unit tests
        'src/main.tsx',
        'server/index.ts',
        'server/server.ts',
        'server/types.ts', // Type-only module
      ],
      // Thresholds - unit tests should have high coverage on testable code
      // Function threshold is slightly lower because React cleanup functions
      // and inline event handlers are difficult to cover in unit tests;
      // e2e tests provide better coverage for interaction code
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 80,
        statements: 90,
      },
    },
  },
});
