import { expect, test } from '@playwright/test'

test('Hello MAURO page renders with the three workspace package names', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Hello MAURO' })).toBeVisible()
  await expect(page.getByText('@mauro/sim')).toBeVisible()
  await expect(page.getByText('@mauro/llm')).toBeVisible()
  await expect(page.getByText('@mauro/geo')).toBeVisible()
})
