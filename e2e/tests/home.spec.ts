import { expect, test } from '@playwright/test'

// Replaces the kickoff bundle's hello.spec.ts after the home page was
// rewritten to be auth-aware. Eng-review test plan #48 (REGRESSION-CRITICAL)
// required this replacement, not a silent deletion.
//
// Authenticated-state coverage is deferred to a follow-up that fixtures a
// signed-in session — for v0 this signed-out check is sufficient.

test('home page (signed out) renders the brand and the sign-in CTA', async ({ page }) => {
  await page.goto('/')

  // Display title — Fraunces "Mauro" + stamp-red period.
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
  await expect(heading).toContainText('Mauro')

  // Tagline establishing the wedge.
  await expect(page.getByText(/Real-Earth-derived geography/i)).toBeVisible()

  // CTA — when signed out, "Sign in" is the only call-to-action visible.
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
})

test('sign-in page shows the magic-link form', async ({ page }) => {
  await page.goto('/auth/sign-in')

  await expect(page.getByRole('heading', { level: 1, name: 'Sign in.' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send the link' })).toBeVisible()
})

test('check-email page renders without the email param', async ({ page }) => {
  await page.goto('/auth/check-email')
  await expect(page.getByRole('heading', { level: 1, name: 'Sent.' })).toBeVisible()
})

test('error page renders a generic message for unknown reason', async ({ page }) => {
  await page.goto('/auth/error')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible()
})
