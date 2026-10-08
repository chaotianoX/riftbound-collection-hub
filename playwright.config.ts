import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    actionTimeout: 15000,
    launchOptions: { executablePath: process.env.P0_CHROMIUM_PATH || '/usr/bin/chromium' },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: 'npm run start', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI },
});
