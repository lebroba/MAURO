import { chromium, type FullConfig } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

// Playwright global setup — runs once before any test.
// Authenticates the E2E test user via /api/test-signin (a dev-only endpoint
// gated by TEST_AUTH_SECRET) and saves the resulting cookies to a storage
// state file. Tests that need to be signed in load this state instead of
// going through the magic-link flow per-test.
//
// Why not call /api/test-signin from inside each test? Because we'd pay
// the admin.generateLink + verifyOtp cost per test (~500ms) and we'd be
// re-creating the same session anyway. One signed-in fixture, reused.

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'e2e+mauro@example.com'
const STORAGE_STATE_DIR = path.join(import.meta.dirname, '.auth')
const STORAGE_STATE_PATH = path.join(STORAGE_STATE_DIR, 'user.json')

export { STORAGE_STATE_PATH, TEST_EMAIL }

async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    'http://localhost:3000'
  // Same fallback as playwright.config.ts so the test runner and the dev
  // server agree on the secret without forcing a shell export.
  const secret =
    process.env.TEST_AUTH_SECRET ?? 'mauro-local-e2e-do-not-use-in-prod'

  await mkdir(STORAGE_STATE_DIR, { recursive: true })

  // Single browser context to call /api/test-signin and capture cookies.
  // Using a real browser context (not just a fetch) so cookies land in the
  // exact format Playwright's storageState expects.
  const browser = await chromium.launch()
  const context = await browser.newContext()
  try {
    const res = await context.request.post(`${baseURL}/api/test-signin`, {
      headers: {
        'x-test-secret': secret,
        'content-type': 'application/json',
      },
      data: { email: TEST_EMAIL },
    })
    if (!res.ok()) {
      const body = await res.text()
      throw new Error(
        `test-signin failed: HTTP ${res.status()} — ${body}`,
      )
    }

    // Sanity-check: the signed-in cookies should now be on the context.
    const cookies = await context.cookies(baseURL)
    const hasAuth = cookies.some((c) => c.name.startsWith('sb-'))
    if (!hasAuth) {
      throw new Error(
        'test-signin returned 200 but no Supabase session cookies were set. ' +
          'Check the SSR client cookie adapter or @supabase/ssr version.',
      )
    }

    await context.storageState({ path: STORAGE_STATE_PATH })
  } finally {
    await context.close()
    await browser.close()
  }
}

export default globalSetup
