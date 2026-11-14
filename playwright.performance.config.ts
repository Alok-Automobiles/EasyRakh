import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PERFORMANCE_PORT || 3108);
export default defineConfig({
  testDir: './tests/performance',
  timeout: 60_000,
  workers: 1,
  outputDir: 'test-results/performance-browser',
  use: {
    ...devices['Pixel 5'],
    baseURL: `http://localhost:${port}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec tsx scripts/performance-server.ts',
    url: `http://localhost:${port}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
