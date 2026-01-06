import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';
import type { SessionsResponse } from '../../server/types';

// Mock the useCancelLoop hook
vi.mock('../hooks/useCancelLoop', () => ({
  useCancelLoop: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
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

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockReset();
  });

  it('renders header', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSessionsResponse,
    } as Response);

    render(<App />, { wrapper: createWrapper() });

    expect(screen.getByText('Ralph Dashboard')).toBeInTheDocument();
  });

  it('renders footer', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSessionsResponse,
    } as Response);

    render(<App />, { wrapper: createWrapper() });

    expect(
      screen.getByText(
        'Ralph Dashboard - Part of the Ralph Wiggum Pro plugin for Claude Code - Crafted with ❤️ in Biarritz'
      )
    ).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    // Never resolve the fetch to keep it loading
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}));

    render(<App />, { wrapper: createWrapper() });

    expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

    render(<App />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load sessions:/)).toBeInTheDocument();
    });
  });

  it('renders stats bar when data loads', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSessionsResponse,
    } as Response);

    render(<App />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Total Loops')).toBeInTheDocument();
    });
  });

  it('renders session table when data loads', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSessionsResponse,
    } as Response);

    render(<App />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Active Loops')).toBeInTheDocument();
    });
  });

  it('displays session data correctly', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSessionsResponse,
    } as Response);

    render(<App />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('test-project')).toBeInTheDocument();
    });
  });

  it('shows active count from API response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...mockSessionsResponse,
        active_count: 3,
      }),
    } as Response);

    render(<App />, { wrapper: createWrapper() });

    await waitFor(() => {
      // The active count badge in StatsBar
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  it('handles empty sessions array', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessions: [],
        total: 0,
        active_count: 0,
      }),
    } as Response);

    render(<App />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('No active loops')).toBeInTheDocument();
    });
  });

  it('makes correct API call', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSessionsResponse,
    } as Response);

    render(<App />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/sessions');
    });
  });

  it('handles HTTP error response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    render(<App />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load sessions:/)).toBeInTheDocument();
    });
  });
});
