import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionRow } from '../components/SessionRow';
import type { Session } from '../../server/types';

// Mock the useCancelLoop hook
const mockMutate = vi.fn();
vi.mock('../hooks/useCancelLoop', () => ({
  useCancelLoop: () => ({
    mutate: mockMutate,
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

const createMockSession = (overrides: Partial<Session> = {}): Session => ({
  loop_id: 'test-loop-1',
  session_id: 'test-session-1',
  status: 'active',
  project: '/path/to/project',
  project_name: 'test-project',
  state_file_path: '/path/to/state-file',
  task: 'Test task description',
  started_at: '2024-01-15T10:00:00.000Z',
  ended_at: null,
  duration_seconds: 120,
  iterations: 5,
  max_iterations: 10,
  completion_promise: 'COMPLETE',
  error_reason: null,
  ...overrides,
});

function renderRow(session: Session) {
  return render(
    <table>
      <tbody>
        <SessionRow session={session} />
      </tbody>
    </table>,
    { wrapper: createWrapper() }
  );
}

describe('SessionRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders session project name', () => {
      renderRow(createMockSession({ project_name: 'my-project' }));
      expect(screen.getByText('my-project')).toBeInTheDocument();
    });

    it('renders task description', () => {
      renderRow(createMockSession({ task: 'My task description' }));
      expect(screen.getByText('My task description')).toBeInTheDocument();
    });

    it('truncates long task descriptions', () => {
      const longTask = 'A'.repeat(100);
      renderRow(createMockSession({ task: longTask }));
      expect(screen.getByText('A'.repeat(60) + '...')).toBeInTheDocument();
    });

    it('displays dash for missing task', () => {
      renderRow(createMockSession({ task: undefined as unknown as string }));
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('displays iterations count correctly', () => {
      renderRow(createMockSession({ iterations: 3, max_iterations: 10 }));
      expect(screen.getByText('3/10')).toBeInTheDocument();
    });

    it('displays N/A for null iterations', () => {
      renderRow(createMockSession({ iterations: null }));
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });

    it('displays 0 iterations correctly (not as N/A)', () => {
      renderRow(createMockSession({ iterations: 0, max_iterations: 10 }));
      expect(screen.getByText('0/10')).toBeInTheDocument();
    });
  });

  describe('status badges', () => {
    it('displays Active status badge', () => {
      renderRow(createMockSession({ status: 'active' }));
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('displays Success status badge', () => {
      renderRow(createMockSession({ status: 'success' }));
      expect(screen.getByText('✓ Success')).toBeInTheDocument();
    });

    it('displays Cancelled status badge', () => {
      renderRow(createMockSession({ status: 'cancelled' }));
      expect(screen.getByText('⏹ Cancelled')).toBeInTheDocument();
    });

    it('displays Max Iterations status badge', () => {
      renderRow(createMockSession({ status: 'max_iterations' }));
      expect(screen.getByText('⚠ Max Iterations')).toBeInTheDocument();
    });

    it('displays Error status badge', () => {
      renderRow(createMockSession({ status: 'error' }));
      expect(screen.getByText('✗ Error')).toBeInTheDocument();
    });

    it('displays Unknown status for unrecognized status', () => {
      renderRow(
        createMockSession({
          status: 'unknown_status' as Session['status'],
        })
      );
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('duration formatting', () => {
    it('formats seconds correctly', () => {
      renderRow(createMockSession({ duration_seconds: 45 }));
      expect(screen.getByText('45s')).toBeInTheDocument();
    });

    it('formats minutes correctly', () => {
      renderRow(createMockSession({ duration_seconds: 180 })); // 3 minutes
      expect(screen.getByText('3m')).toBeInTheDocument();
    });

    it('formats hours and minutes correctly', () => {
      renderRow(createMockSession({ duration_seconds: 3900 })); // 1h 5m
      expect(screen.getByText('1h 5m')).toBeInTheDocument();
    });

    it('displays dash for undefined duration', () => {
      renderRow(
        createMockSession({ duration_seconds: undefined as unknown as number })
      );
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  describe('row expansion', () => {
    it('expands when row is clicked', () => {
      renderRow(createMockSession({ status: 'active' }));

      const row = screen.getByText('test-project').closest('tr');
      fireEvent.click(row!);

      // Should show SessionDetail content
      expect(screen.getByText('Project Path')).toBeInTheDocument();
    });

    it('collapses when expanded row is clicked again', () => {
      renderRow(createMockSession({ status: 'active' }));

      const row = screen.getByText('test-project').closest('tr');
      fireEvent.click(row!);
      expect(screen.getByText('Project Path')).toBeInTheDocument();

      fireEvent.click(row!);
      expect(screen.queryByText('Project Path')).not.toBeInTheDocument();
    });

    it('shows expand indicator arrow', () => {
      renderRow(createMockSession());
      expect(screen.getByText('▶')).toBeInTheDocument();
    });
  });

  describe('cancel functionality', () => {
    it('shows cancel modal when cancel button is clicked', async () => {
      renderRow(createMockSession({ status: 'active' }));

      // Expand row to see cancel button
      const row = screen.getByText('test-project').closest('tr');
      fireEvent.click(row!);

      // Click cancel button
      const cancelButton = screen.getByText('⏹ Cancel Loop');
      fireEvent.click(cancelButton);

      // Modal should appear
      await waitFor(() => {
        expect(screen.getByText('Cancel Loop?')).toBeInTheDocument();
      });
    });

    it('closes modal when Keep Running is clicked', async () => {
      renderRow(createMockSession({ status: 'active' }));

      // Expand and click cancel
      const row = screen.getByText('test-project').closest('tr');
      fireEvent.click(row!);
      fireEvent.click(screen.getByText('⏹ Cancel Loop'));

      await waitFor(() => {
        expect(screen.getByText('Cancel Loop?')).toBeInTheDocument();
      });

      // Click Keep Running
      fireEvent.click(screen.getByText('Keep Running'));

      await waitFor(() => {
        expect(screen.queryByText('Cancel Loop?')).not.toBeInTheDocument();
      });
    });

    it('calls mutate when confirming cancel', async () => {
      renderRow(createMockSession({ loop_id: 'loop-123', status: 'active' }));

      // Expand and click cancel
      const row = screen.getByText('test-project').closest('tr');
      fireEvent.click(row!);
      fireEvent.click(screen.getByText('⏹ Cancel Loop'));

      await waitFor(() => {
        expect(screen.getByText('Cancel Loop?')).toBeInTheDocument();
      });

      // Confirm cancel - find the confirm button with bg-claude-coral class
      const buttons = screen.getAllByRole('button');
      const confirmButton = buttons.find(
        (btn) =>
          btn.textContent === 'Cancel Loop' &&
          btn.classList.contains('bg-claude-coral')
      );
      fireEvent.click(confirmButton!);

      expect(mockMutate).toHaveBeenCalledWith('loop-123', expect.any(Object));
    });

    it('closes modal and row on successful cancel', async () => {
      // Mock mutate to call onSuccess
      mockMutate.mockImplementation((_loopId, options) => {
        options?.onSuccess?.();
      });

      renderRow(createMockSession({ loop_id: 'loop-123', status: 'active' }));

      // Expand and click cancel
      const row = screen.getByText('test-project').closest('tr');
      fireEvent.click(row!);
      fireEvent.click(screen.getByText('⏹ Cancel Loop'));

      await waitFor(() => {
        expect(screen.getByText('Cancel Loop?')).toBeInTheDocument();
      });

      // Confirm cancel
      const buttons = screen.getAllByRole('button');
      const confirmButton = buttons.find(
        (btn) =>
          btn.textContent === 'Cancel Loop' &&
          btn.classList.contains('bg-claude-coral')
      );
      fireEvent.click(confirmButton!);

      // Modal should be closed
      await waitFor(() => {
        expect(screen.queryByText('Cancel Loop?')).not.toBeInTheDocument();
      });

      // Row should be collapsed (Project Path is detail content)
      expect(screen.queryByText('Project Path')).not.toBeInTheDocument();
    });

    it('shows alert on cancel error', async () => {
      // Mock alert
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      // Mock mutate to call onError
      mockMutate.mockImplementation((_loopId, options) => {
        options?.onError?.(new Error('Cancel failed'));
      });

      renderRow(createMockSession({ loop_id: 'loop-123', status: 'active' }));

      // Expand and click cancel
      const row = screen.getByText('test-project').closest('tr');
      fireEvent.click(row!);
      fireEvent.click(screen.getByText('⏹ Cancel Loop'));

      await waitFor(() => {
        expect(screen.getByText('Cancel Loop?')).toBeInTheDocument();
      });

      // Confirm cancel
      const buttons = screen.getAllByRole('button');
      const confirmButton = buttons.find(
        (btn) =>
          btn.textContent === 'Cancel Loop' &&
          btn.classList.contains('bg-claude-coral')
      );
      fireEvent.click(confirmButton!);

      // Alert should have been called
      expect(alertSpy).toHaveBeenCalledWith('Failed to cancel: Cancel failed');

      alertSpy.mockRestore();
    });
  });

  describe('date formatting', () => {
    it('formats date correctly', () => {
      renderRow(createMockSession({ started_at: '2024-01-15T10:30:00.000Z' }));
      // The date will be formatted according to locale, check it contains the expected format
      const dateCells = screen.getAllByText(/1\/15\/2024/);
      expect(dateCells.length).toBeGreaterThan(0);
    });
  });
});
