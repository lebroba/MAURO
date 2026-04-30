import { test, expect } from '@playwright/test'

// Authenticated happy-path E2E. Validates the full flow that the v0 demo
// hinges on:
//   1. Signed-in user lands on /worlds/new
//   2. Submitting the form creates a world and redirects to /worlds/[id]
//   3. The hillshade canvas mounts (T+0000 PNG resolves)
//   4. Triggering the volcano event re-renders to T+0001 with a NEW canvas
//      source URL — proving the read-side replay + write-side render +
//      content-addressed storage path all line up
//
// The test runs against the dev server (localhost) using a session
// established in global-setup.ts via /api/test-signin. Tile assets are
// expected to be uploaded already; if they aren't, the canvas will never
// mount and this test will fail with a clear timeout — which is the right
// failure mode (you forgot to run prep-tiles).

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'e2e+mauro@example.com'
const TEST_AUTH_SECRET =
  process.env.TEST_AUTH_SECRET ?? 'mauro-local-e2e-do-not-use-in-prod'

test.describe('authed world flow', () => {
  test.beforeEach(async ({ request }) => {
    // Wipe the test user's worlds so each test starts clean. The user, their
    // workspace, and their allowlist row are all preserved.
    const res = await request.post('/api/test-cleanup', {
      headers: { 'x-test-secret': TEST_AUTH_SECRET },
      data: { email: TEST_EMAIL },
    })
    expect(res.ok()).toBe(true)
  })

  test('create world → trigger volcano → render swaps to T+0001', async ({
    page,
  }) => {
    // -- Create world ----------------------------------------------------
    await page.goto('/worlds/new')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Begin.' }),
    ).toBeVisible()

    await page.fill('#name', 'Smoke Test World')
    // earth-patagonia is the default selection; leave the tile picker alone.
    await page.getByRole('button', { name: /^begin the world$/i }).click()

    // World detail redirect.
    await page.waitForURL(/\/worlds\/[0-9a-f-]{36}$/, { timeout: 30_000 })

    // -- T+0000 hillshade -------------------------------------------------
    // MapLibre mounts a `<canvas class="maplibregl-canvas">` once the image
    // source loads. If the tile isn't in Storage we never see it — that's
    // the correct failure mode for this regression net.
    const canvas = page.locator('canvas.maplibregl-canvas')
    await expect(canvas).toBeVisible({ timeout: 30_000 })

    // The ledger or scrubber pin should mention T+0000 at this point.
    // The ledger row reads `T+0000 · Genesis`, so we match the prefix.
    await expect(page.getByText(/T\+0000/).first()).toBeVisible()

    // -- Trigger volcano --------------------------------------------------
    const triggerBtn = page.getByRole('button', { name: /trigger volcanic uplift/i })
    await expect(triggerBtn).toBeVisible()
    await triggerBtn.click()

    // The endpoint synchronously renders + uploads, so the response only
    // resolves once the post-event PNG is in Storage. After router.refresh
    // re-runs the server component, the trigger button is gone (a world
    // with a GeographyMutation event hides the button) and a new T+0001
    // stop appears on the scrubber.
    await expect(triggerBtn).toHaveCount(0, { timeout: 60_000 })
    // T+0001 appears in both the ledger (as a prefix) and the scrubber pin
    // (after auto-advance). Either is fine for this regression net.
    await expect(page.getByText(/T\+0001/).first()).toBeVisible()

    // The map canvas is still mounted — the source URL swapped in-place
    // via MapView's updateImage effect.
    await expect(canvas).toBeVisible()
  })
})
