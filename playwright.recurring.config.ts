import { defineConfig, devices } from '@playwright/test';

const url = process.env.TEST_SUPABASE_URL;
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Recurring menu E2E requires the isolated local Supabase stack.');
if (!process.env.TEST_SUPABASE_ANON_KEY || !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing local Supabase test credentials.');

export default defineConfig({
  testDir: './__tests__/e2e', testMatch: 'recurring-menus.spec.ts', workers: 1, timeout: 180_000,
  expect: { timeout: 15_000 }, reporter: 'list',
  use: { baseURL: 'http://localhost:3100', actionTimeout: 20_000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 } } },
  ],
  webServer: {
    command: 'npm run dev -- --port 3100', url: 'http://localhost:3100', reuseExistingServer: false,
    env: { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.TEST_SUPABASE_ANON_KEY, NEXT_BUILD_DIR: '.next-recurring-test' },
  },
});
