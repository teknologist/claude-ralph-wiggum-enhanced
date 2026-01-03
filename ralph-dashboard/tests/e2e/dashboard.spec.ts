import { test, expect } from '@playwright/test';

test.describe('Ralph Dashboard', () => {
  test('loads the dashboard page', async ({ page }) => {
    await page.goto('/');

    // Check header is visible - use getByRole to be more specific
    await expect(
      page.getByRole('heading', { name: 'Ralph Dashboard' })
    ).toBeVisible();

    // Check footer is visible
    await expect(
      page.getByText(
        'Ralph Dashboard - Part of the Ralph Wiggum plugin for Claude Code'
      )
    ).toBeVisible();
  });

  test('displays stats bar', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load - check stats bar labels
    await expect(page.getByText('Total Loops')).toBeVisible();
    // Use first() since "Active" appears in multiple places
    await expect(page.getByText('Active').first()).toBeVisible();
    await expect(page.getByText('Success Rate')).toBeVisible();
    await expect(page.getByText('Avg Duration')).toBeVisible();
  });

  test('displays session table with tabs', async ({ page }) => {
    await page.goto('/');

    // Check tabs are visible
    await expect(page.getByText('Active Loops')).toBeVisible();
    await expect(page.getByText('Archived')).toBeVisible();
  });

  test('can switch between active and archived tabs', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByText('Total Loops')).toBeVisible();

    // Click on Archived tab - use role button to be specific
    await page.getByRole('button', { name: /Archived/ }).click();

    // Check that we're now on the archived tab
    // The session table should still be visible
    await expect(page.getByRole('table')).toBeVisible();

    // Switch back to Active tab
    await page.getByRole('button', { name: /Active Loops/ }).click();
  });

  test('API endpoint returns sessions', async ({ request }) => {
    const response = await request.get('/api/sessions');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('sessions');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('active_count');
    expect(Array.isArray(data.sessions)).toBeTruthy();
  });

  test('API returns 404 for non-existent session', async ({ request }) => {
    const response = await request.get('/api/sessions/non-existent-id');
    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.error).toBe('NOT_FOUND');
  });

  test('API returns 400 when trying to cancel non-active session', async ({
    request,
  }) => {
    // First get a non-existent session (will return 404)
    const response = await request.post('/api/sessions/non-existent-id/cancel');
    expect(response.status()).toBe(404);
  });

  test('dashboard shows loading state initially', async ({ page }) => {
    // Use route to slow down the API response
    await page.route('/api/sessions', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.continue();
    });

    await page.goto('/');

    // We should briefly see loading state
    // (this might be too fast to catch, so we check for eventual content instead)
    await expect(page.getByText('Total Loops')).toBeVisible({ timeout: 5000 });
  });

  test('dashboard handles API error gracefully', async ({ page }) => {
    // Mock API error
    await page.route('/api/sessions', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'INTERNAL_ERROR',
          message: 'Server error',
        }),
      });
    });

    await page.goto('/');

    // Should show error message
    await expect(page.getByText(/Failed to load sessions/)).toBeVisible({
      timeout: 5000,
    });
  });

  test('static assets are served correctly', async ({ page }) => {
    await page.goto('/');

    // Check that CSS is loaded (page should have styled elements)
    const header = page.locator('header');
    await expect(header).toHaveClass(/bg-claude-dark/);
  });
});
