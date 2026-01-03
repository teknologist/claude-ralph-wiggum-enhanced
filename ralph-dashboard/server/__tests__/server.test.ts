import { describe, it, expect } from 'vitest';

// Note: We can't easily test the actual server startup without starting the process
// These tests verify module structure and exports

describe('server module structure', () => {
  it('has handleGetSessions exported from sessions API', async () => {
    const { handleGetSessions } = await import('../api/sessions');
    expect(typeof handleGetSessions).toBe('function');
  });

  it('has handleGetSession exported from sessions API', async () => {
    const { handleGetSession } = await import('../api/sessions');
    expect(typeof handleGetSession).toBe('function');
  });

  it('has handleCancelSession exported from cancel API', async () => {
    const { handleCancelSession } = await import('../api/cancel');
    expect(typeof handleCancelSession).toBe('function');
  });

  it('types module exports type definitions', async () => {
    // Just verify the module can be imported
    const types = await import('../types');
    expect(types).toBeDefined();
  });
});
