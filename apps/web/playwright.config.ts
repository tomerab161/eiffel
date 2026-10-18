import { defineConfig, devices } from '@playwright/test';

// QA scripts (e2e/): drive the built web app through the browser only. Playwright starts the API with
// in-memory storage (no MongoDB) and the production web build, wired together through the preview proxy.
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: use a preinstalled Chromium instead of `playwright install chromium`.
const API_PORT = 3100;
const WEB_PORT = 4173;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

const config = defineConfig({
  testDir: 'e2e',
  outputDir: '../../reports/e2e/results',
  reporter: [['list'], ['html', { outputFolder: '../../reports/e2e/html', open: 'never' }]],
  forbidOnly: true,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: [
    {
      command: 'node src/server.ts',
      cwd: '../api',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { HOST: '127.0.0.1', PORT: String(API_PORT), STORAGE: 'memory', LOG_LEVEL: 'warn' },
      reuseExistingServer: false,
    },
    {
      command: `vite build && vite preview --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { API_URL: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
    },
  ],
});

export default config;
