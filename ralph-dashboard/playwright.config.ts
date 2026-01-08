import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
  use: {
    baseURL: 'http://localhost:3847',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // When COVERAGE=true, use dev server with instrumentation
    // In CI with coverage, build first then run dev with coverage
    // In CI without coverage, use production server
    command: process.env.COVERAGE
      ? 'bun run build && COVERAGE=true bun run dev'
      : process.env.CI
        ? 'bun run start'
        : 'bun run dev',
    url: 'http://localhost:3847',
    // Don't reuse existing server when collecting coverage
    reuseExistingServer: !process.env.CI && !process.env.COVERAGE,
    timeout: process.env.CI ? 60000 : 30000, // Longer timeout for CI
  },
});
