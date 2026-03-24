import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/global-setup.ts'],
  timeout: 60000,
  retries: 1,
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    storageState: path.join(__dirname, 'e2e/.auth/user.json'),
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
