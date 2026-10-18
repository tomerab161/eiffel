// qa-procedure: qa/status/status-page.md
import { expect, test } from '@playwright/test';

test('the status page shows that all systems work', async ({ page }) => {
  // Step 1: open the app's home page.
  await page.goto('/');
  // Step 2: the page is titled Status.
  await expect(page.getByRole('heading', { name: 'Status' })).toBeVisible();
  // Step 3: the status line says all systems are operational.
  await expect(page.getByRole('status')).toHaveText('All systems operational');
});
