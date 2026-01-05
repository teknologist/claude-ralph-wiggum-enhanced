import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TranscriptTimeline } from '../components/TranscriptTimeline';
import type { Session } from '../../server/types';
import React from 'react';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const createMockSession = (overrides: Partial<Session> = {}): Session => ({
  loop_id: 'test-loop-123',
  session_id: 'test-session-456',
  status: 'success',
  project: '/path/to/project',
  project_name: 'Test Project',
  state_file_path: '/path/to/state-file.md',
  task: 'Build a REST API with authentication',
  started_at: '2024-01-15T10:00:00.000Z',
  ended_at: '2024-01-15T11:00:00.000Z',
  duration_seconds: 3600,
  iterations: 3,
  max_iterations: 10,
  completion_promise: 'TASK COMPLETE',
  error_reason: null,
  has_checklist: false,
  checklist_progress: null,
  ...overrides,
});

describe('TranscriptTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('collapsed state', () => {
    it('renders collapsed by default', () => {
      render(<TranscriptTimeline session={createMockSession()} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByText('Transcript')).toBeInTheDocument();
      expect(screen.queryByText('USER PROMPT')).not.toBeInTheDocument();
    });

    it('shows expand arrow', () => {
      render(<TranscriptTimeline session={createMockSession()} />, {
        wrapper: createWrapper(),
      });

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('expanded state', () => {
    it('expands when clicked', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            {
              iteration: 1,
              timestamp: '2024-01-15T10:00:00Z',
              output: 'First output',
            },
          ],
        }),
      } as Response);

      render(<TranscriptTimeline session={createMockSession()} />, {
        wrapper: createWrapper(),
      });

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('USER PROMPT')).toBeInTheDocument();
      });
    });

    it('shows loading state while fetching', async () => {
      vi.mocked(global.fetch).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<TranscriptTimeline session={createMockSession()} />, {
        wrapper: createWrapper(),
      });

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('Loading transcript...')).toBeInTheDocument();
      });
    });

    it('shows no transcript message on error', async () => {
      // Mock fetch to reject - this simulates a network error or API error
      // Use mockImplementation to ensure all retries also fail
      vi.mocked(global.fetch).mockImplementation(() =>
        Promise.reject(new Error('Not found'))
      );

      render(<TranscriptTimeline session={createMockSession()} />, {
        wrapper: createWrapper(),
      });

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(
        () => {
          expect(
            screen.getByText('No transcript available (recorded from v2.1.0+)')
          ).toBeInTheDocument();
        },
        { timeout: 5000 }
      );
    });

    it('shows user prompt from session task', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'Test' },
          ],
        }),
      } as Response);

      render(
        <TranscriptTimeline
          session={createMockSession({ task: 'My specific task' })}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('My specific task')).toBeInTheDocument();
      });
    });
  });

  describe('iterations display', () => {
    it('shows iteration cards with output', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            {
              iteration: 1,
              timestamp: '2024-01-15T10:00:00Z',
              output: 'First iteration output',
            },
            {
              iteration: 2,
              timestamp: '2024-01-15T10:30:00Z',
              output: 'Second iteration output',
            },
          ],
        }),
      } as Response);

      render(<TranscriptTimeline session={createMockSession()} />, {
        wrapper: createWrapper(),
      });

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('Iteration 1')).toBeInTheDocument();
        expect(screen.getByText('Iteration 2')).toBeInTheDocument();
        expect(screen.getByText('First iteration output')).toBeInTheDocument();
        expect(screen.getByText('Second iteration output')).toBeInTheDocument();
      });
    });

    it('updates header with iteration count', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'Test' },
            { iteration: 2, timestamp: '2024-01-15T10:30:00Z', output: 'Test' },
            { iteration: 3, timestamp: '2024-01-15T11:00:00Z', output: 'Test' },
          ],
        }),
      } as Response);

      render(<TranscriptTimeline session={createMockSession()} />, {
        wrapper: createWrapper(),
      });

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(
          screen.getByText('Transcript (3 iterations)')
        ).toBeInTheDocument();
      });
    });

    it('truncates long output with Show more button', async () => {
      const longOutput = 'A'.repeat(400);
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            {
              iteration: 1,
              timestamp: '2024-01-15T10:00:00Z',
              output: longOutput,
            },
          ],
        }),
      } as Response);

      render(<TranscriptTimeline session={createMockSession()} />, {
        wrapper: createWrapper(),
      });

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('Show more')).toBeInTheDocument();
      });

      // Click to expand
      fireEvent.click(screen.getByText('Show more'));
      expect(screen.getByText('Show less')).toBeInTheDocument();
    });
  });

  describe('completion status', () => {
    it('shows success status for completed sessions', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'Test' },
          ],
        }),
      } as Response);

      render(
        <TranscriptTimeline
          session={createMockSession({
            status: 'success',
            completion_promise: 'DONE',
          })}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('COMPLETED')).toBeInTheDocument();
      });
    });

    it('shows in progress status for active sessions', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'Test' },
          ],
        }),
      } as Response);

      render(
        <TranscriptTimeline
          session={createMockSession({ status: 'active' })}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('IN PROGRESS...')).toBeInTheDocument();
      });
    });

    it('shows cancelled status', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'Test' },
          ],
        }),
      } as Response);

      render(
        <TranscriptTimeline
          session={createMockSession({ status: 'cancelled', iterations: 2 })}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('CANCELLED')).toBeInTheDocument();
      });
    });

    it('shows max iterations status', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'Test' },
          ],
        }),
      } as Response);

      render(
        <TranscriptTimeline
          session={createMockSession({
            status: 'max_iterations',
            iterations: 10,
            max_iterations: 10,
          })}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('MAX ITERATIONS REACHED')).toBeInTheDocument();
      });
    });

    it('shows error status with reason', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'Test' },
          ],
        }),
      } as Response);

      render(
        <TranscriptTimeline
          session={createMockSession({
            status: 'error',
            error_reason: 'Something broke',
          })}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('ERROR')).toBeInTheDocument();
        expect(screen.getByText('Something broke')).toBeInTheDocument();
      });
    });

    it('shows orphaned status', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'Test' },
          ],
        }),
      } as Response);

      render(
        <TranscriptTimeline
          session={createMockSession({ status: 'orphaned' })}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('ORPHANED')).toBeInTheDocument();
      });
    });
  });

  describe('search functionality', () => {
    it('filters iterations by search term', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            {
              iteration: 1,
              timestamp: '2024-01-15T10:00:00Z',
              output: 'apple banana',
            },
            {
              iteration: 2,
              timestamp: '2024-01-15T10:30:00Z',
              output: 'orange grape',
            },
          ],
        }),
      } as Response);

      render(<TranscriptTimeline session={createMockSession()} />, {
        wrapper: createWrapper(),
      });

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('Iteration 1')).toBeInTheDocument();
        expect(screen.getByText('Iteration 2')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search iterations...');
      fireEvent.change(searchInput, { target: { value: 'apple' } });

      await waitFor(() => {
        expect(screen.getByText('Iteration 1')).toBeInTheDocument();
        expect(screen.queryByText('Iteration 2')).not.toBeInTheDocument();
        expect(screen.getByText('Found 1 of 2 iterations')).toBeInTheDocument();
      });
    });

    it('clears search with clear button', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            {
              iteration: 1,
              timestamp: '2024-01-15T10:00:00Z',
              output: 'test output',
            },
          ],
        }),
      } as Response);

      render(<TranscriptTimeline session={createMockSession()} />, {
        wrapper: createWrapper(),
      });

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByText('Iteration 1')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search iterations...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Clear search'));

      expect(searchInput).toHaveValue('');
    });
  });

  describe('toolbar actions', () => {
    it('shows export button', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'Test' },
          ],
        }),
      } as Response);

      render(<TranscriptTimeline session={createMockSession()} />, {
        wrapper: createWrapper(),
      });

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByTitle('Export as Markdown')).toBeInTheDocument();
      });
    });

    it('shows view full transcript button', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iterations: [
            { iteration: 1, timestamp: '2024-01-15T10:00:00Z', output: 'Test' },
          ],
        }),
      } as Response);

      render(<TranscriptTimeline session={createMockSession()} />, {
        wrapper: createWrapper(),
      });

      fireEvent.click(screen.getByText('Transcript'));

      await waitFor(() => {
        expect(screen.getByTitle('View full transcript')).toBeInTheDocument();
      });
    });
  });
});
