import { expect, test } from '@playwright/test'

// Worlds-route coverage. Authenticated-state coverage (full create-world
// happy-path, including the RPC + workspace lookup) is deferred — needs a
// signed-in Playwright fixture which we'll add when more of the auth flow
// stabilizes. For now, the SECURITY-flavor tests are what we run: every
// /worlds/* route MUST redirect signed-out users to the sign-in page.
//
// Test plan refs (eng-review):
//   #41 (auth-gated): /worlds/new redirects to sign-in when signed out
//   #43 (SECURITY):   /worlds/[id] for an unknown id redirects to sign-in
//                     (becomes 404 once user is authenticated and RLS
//                     hides foreign rows)

test('GET /worlds/new (signed out) redirects to sign-in with next param', async ({ page }) => {
  await page.goto('/worlds/new')
  await page.waitForURL(/\/auth\/sign-in/)
  expect(new URL(page.url()).pathname).toBe('/auth/sign-in')
  expect(new URL(page.url()).searchParams.get('next')).toBe('/worlds/new')

  // Should land on the sign-in form, not blank.
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in.' })).toBeVisible()
})

test('GET /worlds/<random-id> (signed out) redirects to sign-in', async ({ page }) => {
  await page.goto('/worlds/00000000-0000-0000-0000-000000000000')
  await page.waitForURL(/\/auth\/sign-in/)
  expect(new URL(page.url()).pathname).toBe('/auth/sign-in')
  // The signed-out redirect runs BEFORE we get a chance to check the row,
  // so this never reaches the RLS-protected query. Authenticated 404
  // behavior is covered separately when we add the signed-in fixture.
})

test('POST /api/worlds (no auth, no body) returns 401 — auth checked before body', async ({ request }) => {
  // Auth must precede body validation so unauthenticated callers can't probe
  // input handling. With no session cookie, the response is 401 regardless of
  // whether the body is valid JSON.
  const res = await request.post('/api/worlds')
  expect(res.status()).toBe(401)
  const body = await res.json()
  expect(body.error).toBe('unauthenticated')
})

test('POST /api/worlds (no auth, valid shape) returns 401', async ({ request }) => {
  const res = await request.post('/api/worlds', {
    data: {
      name: 'Test',
      tileSlug: 'earth-patagonia',
      magicLevel: 'standard',
    },
  })
  expect(res.status()).toBe(401)
  const body = await res.json()
  expect(body.error).toBe('unauthenticated')
})
