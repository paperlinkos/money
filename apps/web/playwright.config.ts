import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testIgnore: process.env.E2E_DEDICATED === 'true' ? [] : ['account-workflows.spec.ts'],
  timeout: 60_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_WEB_ORIGIN ?? 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop' },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true } },
  ],
  webServer: {
    command: `npm run dev --workspace=@platform/web -- --host 127.0.0.1 --port ${process.env.E2E_WEB_PORT ?? '4173'}`,
    port: Number(process.env.E2E_WEB_PORT ?? 4173),
    reuseExistingServer: process.env.E2E_DEDICATED !== 'true',
  },
})
