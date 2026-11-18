import { defineConfig, devices } from '@playwright/test';

/**
 * Тесты запускаются против уже поднятого стека:
 *   backend  — http://127.0.0.1:3001
 *   frontend — http://127.0.0.1:5173
 *
 * BASE_URL можно переопределить переменной окружения.
 */
export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:5173',
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Видео требует отдельный ffmpeg; в ЛР9 достаточно скриншота и trace.
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.CI ? undefined : 'chrome',
      },
    },
  ],
});
