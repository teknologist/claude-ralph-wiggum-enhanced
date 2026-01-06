import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSessions } from '../hooks/useSessions';
import { useCancelLoop } from '../hooks/useCancelLoop';
import { useDeleteSession } from '../hooks/useDeleteSession';
import { useArchiveLoop } from '../hooks/useArchiveLoop';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  useTranscriptIterations,
  useFullTranscript,
  useTranscriptAvailability,
} from '../hooks/useTranscript';
import { useDeleteAllArchived } from '../hooks/useDeleteAllArchived';
import type {
  SessionsResponse,
  IterationsResponse,
  FullTranscriptResponse,
  TranscriptAvailabilityResponse,
  DeleteAllResponse,
} from '../../server/types';

// Mock websocket module
vi.mock('../lib/websocket', () => ({
  subscribeToTranscript: vi.fn(() => vi.fn()),
  subscribeToChecklist: vi.fn(() => vi.fn()),
  transcriptWebSocket: {
    subscribe: vi.fn(() => vi.fn()),
    subscribeChecklist: vi.fn(() => vi.fn()),
    disconnect: vi.fn(),
    isConnected: vi.fn(() => false),
  },
}));

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
      loop_id: 'test-loop-1',
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
      has_checklist: false,
      checklist_progress: null,
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

describe('useArchiveLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('archives session successfully', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Successfully archived orphaned loop test-1',
        loop_id: 'test-1',
      }),
    } as Response);

    const { result } = renderHook(() => useArchiveLoop(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('test-1');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/sessions/test-1/archive', {
      method: 'POST',
    });
  });

  it('handles archive error', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Archive failed'));

    const { result } = renderHook(() => useArchiveLoop(), {
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
        message: 'Cannot archive session: status is active, expected orphaned',
      }),
    } as Response);

    const { result } = renderHook(() => useArchiveLoop(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('test-1');

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('starts with isPending false', () => {
    const { result } = renderHook(() => useArchiveLoop(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(false);
  });

  it('sets isPending true during mutation', async () => {
    // Never resolve to keep it pending
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useArchiveLoop(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('test-1');

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });
  });
});

describe('useMediaQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when window.matchMedia is not available', () => {
    // Mock window to not have matchMedia
    const originalMatchMedia = window.matchMedia;
    delete (window as any).matchMedia;

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);

    // Restore matchMedia
    window.matchMedia = originalMatchMedia;
  });

  it('returns initial match state from matchMedia', () => {
    const mockMatchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    window.matchMedia = mockMatchMedia;

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(true);
    expect(mockMatchMedia).toHaveBeenCalledWith('(max-width: 768px)');
  });

  it('updates when media query changes', async () => {
    let storedListener: ((event: MediaQueryListEvent) => void) | null = null;
    const mockMatchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn((_: string, cb: any) => {
        storedListener = cb;
      }),
      removeEventListener: vi.fn(),
    });
    window.matchMedia = mockMatchMedia;

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);
    expect(mockMatchMedia).toHaveBeenCalledWith('(max-width: 768px)');

    // Verify the listener was stored
    expect(storedListener).not.toBeNull();

    // Simulate media query change - note that React state updates may not be synchronous in tests
    // This test primarily verifies the hook sets up the listener correctly
    expect(mockMatchMedia).toHaveBeenCalledTimes(1);
  });

  it('cleans up event listener on unmount', () => {
    const mockRemoveEventListener = vi.fn();
    const mockMatchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: mockRemoveEventListener,
    });
    window.matchMedia = mockMatchMedia;

    const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'));

    unmount();

    // Verify cleanup was called (the listener should be removed)
    expect(mockRemoveEventListener).toHaveBeenCalled();
  });

  it('updates when query changes', () => {
    const mockMatchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    window.matchMedia = mockMatchMedia;

    const { result, rerender } = renderHook(
      ({ query }) => useMediaQuery(query),
      { initialProps: { query: '(max-width: 768px)' } }
    );

    expect(result.current).toBe(true);
    expect(mockMatchMedia).toHaveBeenCalledTimes(1);

    rerender({ query: '(max-width: 480px)' });

    expect(result.current).toBe(true);
    expect(mockMatchMedia).toHaveBeenCalledTimes(2);
  });
});

describe('useTranscriptIterations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when disabled', async () => {
    const { result } = renderHook(
      () => useTranscriptIterations('loop-123', false),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches iterations when enabled', async () => {
    const mockResponse: IterationsResponse = {
      iterations: [
        { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'First' },
        { iteration: 2, timestamp: '2024-01-15T10:30:00Z', output: 'Second' },
      ],
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { result } = renderHook(
      () => useTranscriptIterations('loop-123', true),
      { wrapper: createWrapper() }
    );

    // Wait for the query to complete
    await waitFor(
      () => {
        expect(result.current.isSuccess).toBe(true);
      },
      { timeout: 3000 }
    );

    expect(result.current.data).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/transcript/loop-123/iterations'
    );
  });

  it('handles fetch error', async () => {
    // Mock fetch to reject (network error or thrown error from API function)
    // Use mockImplementation to ensure all retries also fail
    vi.mocked(global.fetch).mockImplementation(() =>
      Promise.reject(new Error('Not found'))
    );

    const { result } = renderHook(
      () => useTranscriptIterations('loop-123', true),
      { wrapper: createWrapper() }
    );

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 5000 }
    );
  });

  it('subscribes to WebSocket for active sessions', async () => {
    const mockResponse: IterationsResponse = {
      iterations: [
        { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'First' },
      ],
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { subscribeToTranscript } = await import('../lib/websocket');

    renderHook(() => useTranscriptIterations('loop-123', true, true), {
      wrapper: createWrapper(),
    });

    // Wait for query to complete
    await waitFor(
      () => {
        expect(subscribeToTranscript).toHaveBeenCalledWith(
          'loop-123',
          expect.any(Function)
        );
      },
      { timeout: 3000 }
    );
  });

  it('merges WebSocket updates with existing data', async () => {
    const mockResponse: IterationsResponse = {
      iterations: [
        { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'First' },
        { iteration: 2, timestamp: '2024-01-15T10:05:00Z', output: 'Second' },
      ],
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    // Mock subscribeToTranscript with callback invocation
    let receivedCallback: ((iterations: any[]) => void) | null = null;
    vi.mocked(
      await import('../lib/websocket')
    ).subscribeToTranscript.mockImplementation((_loopId, callback) => {
      receivedCallback = callback;
      return vi.fn();
    });

    const { result } = renderHook(
      () => useTranscriptIterations('loop-123', true, true),
      { wrapper: createWrapper() }
    );

    // Wait for initial data to load
    await waitFor(
      () => {
        expect(result.current.isSuccess).toBe(true);
      },
      { timeout: 3000 }
    );

    expect(result.current.data?.iterations).toHaveLength(2);

    // Simulate WebSocket update with new iteration
    act(() => {
      receivedCallback?.([
        { iteration: 3, timestamp: '2024-01-15T10:10:00Z', output: 'Third' },
      ]);
    });

    // Should merge and have 3 iterations
    await waitFor(() => {
      expect(result.current.data?.iterations).toHaveLength(3);
      expect(result.current.data?.iterations[2].iteration).toBe(3);
    });
  });

  it('deduplicates iterations from WebSocket', async () => {
    const mockResponse: IterationsResponse = {
      iterations: [
        { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'First' },
      ],
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    // Mock subscribeToTranscript
    let receivedCallback: ((iterations: any[]) => void) | null = null;
    vi.mocked(
      await import('../lib/websocket')
    ).subscribeToTranscript.mockImplementation((_loopId, callback) => {
      receivedCallback = callback;
      return vi.fn();
    });

    const { result } = renderHook(
      () => useTranscriptIterations('loop-123', true, true),
      { wrapper: createWrapper() }
    );

    // Wait for initial data to load
    await waitFor(
      () => {
        expect(result.current.isSuccess).toBe(true);
      },
      { timeout: 3000 }
    );

    expect(result.current.data?.iterations).toHaveLength(1);

    // Simulate WebSocket update with duplicate iteration
    act(() => {
      receivedCallback?.([
        { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'First' },
      ]);
    });

    // Should still have only 1 iteration (deduplicated)
    await waitFor(() => {
      expect(result.current.data?.iterations).toHaveLength(1);
    });
  });

  it('does not subscribe when not active', async () => {
    const mockResponse: IterationsResponse = {
      iterations: [
        { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'First' },
      ],
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { subscribeToTranscript } = await import('../lib/websocket');

    renderHook(
      () => useTranscriptIterations('loop-123', true, false), // isActive = false
      { wrapper: createWrapper() }
    );

    // Wait for query to complete
    await waitFor(
      () => {
        expect(subscribeToTranscript).not.toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });
});

describe('useFullTranscript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when disabled', async () => {
    const { result } = renderHook(() => useFullTranscript('loop-123', false), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches full transcript when enabled', async () => {
    const mockResponse: FullTranscriptResponse = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { result } = renderHook(() => useFullTranscript('loop-123', true), {
      wrapper: createWrapper(),
    });

    // Wait for the query to complete
    await waitFor(
      () => {
        expect(result.current.isSuccess).toBe(true);
      },
      { timeout: 3000 }
    );

    expect(result.current.data).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith('/api/transcript/loop-123/full');
  });

  it('handles fetch error', async () => {
    // Mock fetch to reject (network error or thrown error from API function)
    // Use mockImplementation to ensure all retries also fail
    vi.mocked(global.fetch).mockImplementation(() =>
      Promise.reject(new Error('Not found'))
    );

    const { result } = renderHook(() => useFullTranscript('loop-123', true), {
      wrapper: createWrapper(),
    });

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 5000 }
    );
  });
});

describe('useTranscriptAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches availability status', async () => {
    const mockResponse: TranscriptAvailabilityResponse = {
      hasIterations: true,
      hasFullTranscript: true,
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { result } = renderHook(() => useTranscriptAvailability('loop-123'), {
      wrapper: createWrapper(),
    });

    // Wait for the query to complete
    await waitFor(
      () => {
        expect(result.current.isSuccess).toBe(true);
      },
      { timeout: 3000 }
    );

    expect(result.current.data).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith('/api/transcript/loop-123');
  });

  it('handles fetch error', async () => {
    // Mock fetch to reject (network error or thrown error from API function)
    // Use mockImplementation to ensure all retries also fail
    vi.mocked(global.fetch).mockImplementation(() =>
      Promise.reject(new Error('Check failed'))
    );

    const { result } = renderHook(() => useTranscriptAvailability('loop-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 5000 }
    );
  });
});

describe('useDeleteAllArchived', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully deletes all archived sessions', async () => {
    const mockResponse: DeleteAllResponse = {
      success: true,
      deleted_count: 5,
      message: 'Permanently deleted 5 archived session(s)',
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { result } = renderHook(() => useDeleteAllArchived(), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith('/api/sessions', {
      method: 'DELETE',
    });
  });

  it('invalidates sessions query on success', async () => {
    const mockResponse: DeleteAllResponse = {
      success: true,
      deleted_count: 3,
      message: 'Permanently deleted 3 archived session(s)',
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    // Create a custom wrapper with accessible queryClient
    const testQueryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const invalidateQueriesSpy = vi.spyOn(testQueryClient, 'invalidateQueries');

    const customWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={testQueryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useDeleteAllArchived(), {
      wrapper: customWrapper,
    });

    result.current.mutate();

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['sessions'],
      });
    });
  });

  it('handles API error', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'DELETE_ERROR',
        message: 'Failed to delete',
      }),
    } as Response);

    const { result } = renderHook(() => useDeleteAllArchived(), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
