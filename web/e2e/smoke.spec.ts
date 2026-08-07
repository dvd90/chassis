import { expect, test } from '@playwright/test';

/**
 * The two pages every scaffolded project has, whatever auth provider it picked.
 * Assertions stay on structure rather than copy or provider names so this spec
 * survives `--auth none` and `--auth clerk` alike.
 *
 * No API is running: the home page catches an unreachable API and renders the
 * degraded state, which is exactly the path worth checking — a front end that
 * white-screens when the backend is down is the bug this catches.
 */
test('the home page renders with no API behind it', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.card').first()).toBeVisible();
});

test('the sign-in page renders the active provider panel', async ({ page }) => {
  const response = await page.goto('/sign-in');

  expect(response?.status()).toBe(200);
  await expect(page.locator('.center-stage')).toBeVisible();
});

test('no console errors on first paint', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  expect(errors).toEqual([]);
});
