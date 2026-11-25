import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  timeout: 45000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4183',
    contextOptions: { reducedMotion: 'reduce' },
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    },
  ],
  webServer: [
    {
      command: 'uv run --locked uvicorn backend.app:app --port 8113',
      cwd: '..',
      env: { AUTOSPORT_DATA_DIR: resolve('test-results/careers') },
      url: 'http://127.0.0.1:8113/api/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4183 --strictPort',
      env: { AUTOSPORT_API_PORT: '8113' },
      url: 'http://127.0.0.1:4183',
      reuseExistingServer: false,
    },
  ],
})
