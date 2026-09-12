import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.ts',
  workers: 1,
  reporter: 'list',
  outputDir: '.local/test-results',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    browserName: 'chromium',
    channel: 'msedge',
    javaScriptEnabled: false,
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'npm run preview -- --port 4321',
    // Astro 7 otherwise detaches preview in agent environments. Keep it owned by Playwright.
    env: { ...process.env, ASTRO_PREVIEW_BACKGROUND: '1' },
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: true,
  },
  timeout: 60000,
});
