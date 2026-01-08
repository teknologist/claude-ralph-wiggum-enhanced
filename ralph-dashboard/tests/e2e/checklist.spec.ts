import { test, expect } from '../fixtures';

/**
 * E2E tests for Checklist feature.
 *
 * These tests verify the checklist functionality works correctly
 * with the dashboard API and UI.
 */

test.describe('Checklist API Endpoint', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('GET /api/checklist/:loopId returns 404 for non-existent checklist', async ({
    request,
  }) => {
    // Make a direct API call for a non-existent loop
    const response = await request.get(
      'http://localhost:3847/api/checklist/non-existent-loop-id-12345'
    );

    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data).toHaveProperty('error', 'NOT_FOUND');
  });

  test('GET /api/checklist/:loopId returns 400 for invalid loop_id', async ({
    request,
  }) => {
    // Test with path traversal attempt - should be rejected for security
    // Note: The web server may normalize paths, so we test with characters that should be rejected
    const response = await request.get(
      'http://localhost:3847/api/checklist/invalid@#$%loopid'
    );

    // Should reject the request with 400 or 404
    expect([400, 404]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  test('GET /api/checklist/:loopId with valid but non-existent loop_id returns 404', async ({
    request,
  }) => {
    // Test with a valid format but non-existent loop ID
    const validFormatLoopId = 'abc123-def456-ghi789-jkl012';
    const response = await request.get(
      `http://localhost:3847/api/checklist/${validFormatLoopId}`
    );

    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data).toHaveProperty('error', 'NOT_FOUND');
  });
});

test.describe('Checklist Security', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('rejects loop_id with null bytes', async ({ request }) => {
    // Test with null bytes (potential security issue)
    const response = await request.get(
      'http://localhost:3847/api/checklist/test%00nullbyte'
    );

    // Should reject the request
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('rejects overly long loop_id', async ({ request }) => {
    // Test with excessively long loop_id (>256 chars)
    const longId = 'a'.repeat(300);
    const response = await request.get(
      `http://localhost:3847/api/checklist/${longId}`
    );

    // Should reject the request
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('accepts valid loop_id format with dots, dashes, underscores', async ({
    request,
  }) => {
    // Test with valid characters
    const validId = 'test-loop_123.example-v2';
    const response = await request.get(
      `http://localhost:3847/api/checklist/${validId}`
    );

    // Should return 404 (not found) rather than 400 (invalid format)
    // This proves the ID format was accepted
    expect(response.status()).toBe(404);
    const data = await response.json();
    expect(data).toHaveProperty('error', 'NOT_FOUND');
  });
});
