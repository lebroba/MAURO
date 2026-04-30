import { defineConfig } from '@playwright/test'
import path from 'node:path'

// Local-only secret for the test-signin auth bypass. Production never has
// this set (the route 404s without it), so this hardcoded string is safe
// to commit.
const TEST_AUTH_SECRET =
  process.env.TEST_AUTH_SECRET ?? 'mauro-local-e2e-do-not-use-in-prod'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Auth-state tests share one test user; serial avoids DB races.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  globalSetup: path.resolve(import.meta.dirname, './global-setup.ts'),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm --filter @mauro/web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      TEST_AUTH_SECRET,
    },
  },
  projects: [
    {
      name: 'public',
      testMatch: /(home|worlds)\.spec\.ts/,
      use: { browserName: 'chromium' },
    },
    {
      name: 'authed',
      testMatch: /world-flow\.spec\.ts/,
      use: {
        browserName: 'chromium',
        storageState: path.resolve(import.meta.dirname, './.auth/user.json'),
      },
    },
  ],
})
