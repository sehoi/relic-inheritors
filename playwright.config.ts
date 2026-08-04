import { defineConfig } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

export default defineConfig({
  testDir: './tests/smoke',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    browserName: 'chromium',
    viewport: { width: 960, height: 540 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 90_000,
  },
});
