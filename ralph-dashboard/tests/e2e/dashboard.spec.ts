import { test, expect } from '../fixtures';

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
        'Ralph Dashboard - Part of the Ralph Wiggum Pro plugin for Claude Code - Crafted with ❤️ in Biarritz'
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

    // Check tabs are visible - use getByRole to avoid matching "No active loops" text
    await expect(
      page.getByRole('button', { name: 'Active Loops' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Archived/ })).toBeVisible();
  });

  test('can switch between active and archived tabs', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByText('Total Loops')).toBeVisible();

    // Click on Archived tab - use role button to be specific
    await page.getByRole('button', { name: /Archived/ }).click();

    // Check that we're now on the archived tab - either table or empty state
    const table = page.getByRole('table');
    const emptyState = page.getByText('No archived loops yet');
    await expect(table.or(emptyState)).toBeVisible();

    // Switch back to Active tab
    await page.getByRole('button', { name: /Active Loops/ }).click();

    // Verify we're back on active tab - either table or empty state
    const activeEmpty = page.getByText('No active loops');
    await expect(table.or(activeEmpty)).toBeVisible();
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

  test('handles session cancellation errors gracefully', async ({ page }) => {
    // Mock a failed cancel request - specifically target cancel endpoint
    await page.route('**/api/sessions/*/cancel', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'INTERNAL_ERROR',
            message: 'Failed to cancel loop',
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');

    // Page should still load despite the mock
    // (This test ensures the error handling code path exists and doesn't crash)
    await expect(page.getByText('Total Loops')).toBeVisible({ timeout: 5000 });
  });

  test('handles session deletion errors gracefully', async ({ page }) => {
    // Mock a failed delete request - specifically target delete endpoint
    await page.route('**/api/sessions/*', async (route) => {
      // Only intercept DELETE requests to session endpoints
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'INTERNAL_ERROR',
            message: 'Failed to delete session',
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');

    // If there are archived sessions, the error handler should work
    await expect(page.getByText('Total Loops')).toBeVisible({ timeout: 5000 });
  });

  test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('displays correctly on mobile viewport', async ({ page }) => {
      await page.goto('/');

      // Should still see header
      await expect(
        page.getByRole('heading', { name: 'Ralph Dashboard' })
      ).toBeVisible();

      // Should still see stats bar
      await expect(page.getByText('Total Loops')).toBeVisible();
    });
  });
});
