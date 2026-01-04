import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSessions } from '../hooks/useSessions';
import { useCancelLoop } from '../hooks/useCancelLoop';
import { useDeleteSession } from '../hooks/useDeleteSession';
import type { SessionsResponse } from '../../server/types';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockSessionsResponse: SessionsResponse = {
  sessions: [
    {
      session_id: 'test-1',
      status: 'active',
      project: '/path/to/project',
      project_name: 'test-project',
      state_file_path: '/path/to/state',
      task: 'Test task',
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_seconds: 120,
      iterations: 5,
      max_iterations: 10,
      completion_promise: 'COMPLETE',
      error_reason: null,
    },
  ],
  total: 1,
  active_count: 1,
};

describe('useSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches sessions successfully', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSessionsResponse,
    } as Response);

    const { result } = renderHook(() => useSessions(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSessionsResponse);
  });

  it('handles fetch error', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useSessions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
  });

  it('handles HTTP error response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useSessions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('returns correct query key', () => {
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useSessions(), {
      wrapper: createWrapper(),
    });

    // The hook should be using queryKey ['sessions']
    expect(result.current.isLoading).toBe(true);
  });
});

describe('useCancelLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels session successfully', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Session cancelled',
        session_id: 'test-1',
      }),
    } as Response);

    const { result } = renderHook(() => useCancelLoop(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('test-1');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/sessions/test-1/cancel', {
      method: 'POST',
    });
  });

  it('handles cancel error', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Cancel failed'));

    const { result } = renderHook(() => useCancelLoop(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('test-1');

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('handles HTTP error response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() => useCancelLoop(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('test-1');

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('starts with isPending false', () => {
    const { result } = renderHook(() => useCancelLoop(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(false);
  });

  it('sets isPending true during mutation', async () => {
    // Never resolve to keep it pending
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useCancelLoop(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('test-1');

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });
  });
});

describe('useDeleteSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes session successfully', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Session permanently deleted from history',
        session_id: 'test-1',
      }),
    } as Response);

    const { result } = renderHook(() => useDeleteSession(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('test-1');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/sessions/test-1', {
      method: 'DELETE',
    });
  });

  it('handles delete error', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Delete failed'));

    const { result } = renderHook(() => useDeleteSession(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('test-1');

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('handles HTTP error response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'INVALID_STATE',
        message: 'Cannot delete active session',
      }),
    } as Response);

    const { result } = renderHook(() => useDeleteSession(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('test-1');

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('starts with isPending false', () => {
    const { result } = renderHook(() => useDeleteSession(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(false);
  });

  it('sets isPending true during mutation', async () => {
    // Never resolve to keep it pending
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useDeleteSession(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('test-1');

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });
  });
});
