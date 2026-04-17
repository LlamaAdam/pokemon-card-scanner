import { test, expect } from '@playwright/test';

test('landing page renders on iPhone viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Card Scanner' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan a Card' })).toBeVisible();
  // Visual snapshot; first run creates the baseline.
  await expect(page).toHaveScreenshot('landing-iphone.png', { maxDiffPixelRatio: 0.02 });
});
