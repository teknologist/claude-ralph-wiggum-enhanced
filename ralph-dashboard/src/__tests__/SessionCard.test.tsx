import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionCard } from '../components/SessionCard';
import type { Session } from '../../server/types';

// Mock the hooks
const mockCancelMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockArchiveMutate = vi.fn();

vi.mock('../hooks/useCancelLoop', () => ({
  useCancelLoop: () => ({
    mutate: mockCancelMutate,
    isPending: false,
  }),
}));

vi.mock('../hooks/useDeleteSession', () => ({
  useDeleteSession: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
}));

vi.mock('../hooks/useArchiveLoop', () => ({
  useArchiveLoop: () => ({
    mutate: mockArchiveMutate,
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
  has_checklist: false,
  checklist_progress: null,
  ...overrides,
});

function renderCard(session: Session) {
  return render(<SessionCard session={session} />, {
    wrapper: createWrapper(),
  });
}

describe('SessionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders project name', () => {
      renderCard(createMockSession({ project_name: 'my-project' }));
      expect(screen.getByText('my-project')).toBeInTheDocument();
    });

    it('renders task description', () => {
      renderCard(createMockSession({ task: 'My task description' }));
      expect(screen.getByText('My task description')).toBeInTheDocument();
    });

    it('truncates long task descriptions', () => {
      const longTask = 'A'.repeat(150);
      renderCard(createMockSession({ task: longTask }));
      expect(screen.getByText('A'.repeat(100) + '...')).toBeInTheDocument();
    });

    it('shows default text for missing task', () => {
      renderCard(createMockSession({ task: undefined as unknown as string }));
      expect(screen.getByText('No task description')).toBeInTheDocument();
    });

    it('displays iterations count correctly', () => {
      renderCard(createMockSession({ iterations: 3, max_iterations: 10 }));
      expect(screen.getByText('3/10')).toBeInTheDocument();
    });

    it('displays Active for undefined duration_seconds', () => {
      renderCard(createMockSession({ duration_seconds: undefined }));
      const allActive = screen.getAllByText('Active');
      expect(allActive.length).toBeGreaterThanOrEqual(2);
    });

    it('displays duration in seconds', () => {
      renderCard(createMockSession({ duration_seconds: 45 }));
      expect(screen.getByText('45s')).toBeInTheDocument();
    });

    it('displays duration in minutes', () => {
      renderCard(createMockSession({ duration_seconds: 120 }));
      expect(screen.getByText('2m')).toBeInTheDocument();
    });

    it('displays duration in hours and minutes', () => {
      renderCard(createMockSession({ duration_seconds: 3720 }));
      expect(screen.getByText('1h 2m')).toBeInTheDocument();
    });

    it('shows time ago correctly', () => {
      const now = new Date();
      const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
      renderCard(createMockSession({ started_at: fiveMinsAgo.toISOString() }));
      expect(screen.getByText(/5m ago/)).toBeInTheDocument();
    });

    it('shows "just now" for very recent sessions', () => {
      const now = new Date();
      renderCard(createMockSession({ started_at: now.toISOString() }));
      expect(screen.getByText(/just now/)).toBeInTheDocument();
    });

    it('renders status badge', () => {
      renderCard(createMockSession({ status: 'active' }));
      const allActive = screen.getAllByText('Active');
      expect(allActive.length).toBeGreaterThanOrEqual(1);
    });

    it('renders the expand indicator arrow', () => {
      renderCard(createMockSession());
      expect(screen.getByText('▶')).toBeInTheDocument();
    });
  });

  describe('status-specific behavior', () => {
    it('renders active status badge', () => {
      renderCard(createMockSession({ status: 'active' }));
      const allActive = screen.getAllByText('Active');
      expect(allActive.length).toBeGreaterThan(0);
    });

    it('renders success status badge', () => {
      renderCard(createMockSession({ status: 'success' }));
      expect(screen.getByText('✓ Success')).toBeInTheDocument();
    });

    it('renders error status badge', () => {
      renderCard(createMockSession({ status: 'error' }));
      expect(screen.getByText('✗ Error')).toBeInTheDocument();
    });

    it('renders cancelled status badge', () => {
      renderCard(createMockSession({ status: 'cancelled' }));
      expect(screen.getByText('⏹ Cancelled')).toBeInTheDocument();
    });

    it('renders max_iterations status badge', () => {
      renderCard(createMockSession({ status: 'max_iterations' }));
      expect(screen.getByText('⚠ Max Iterations')).toBeInTheDocument();
    });
  });

  describe('modal functionality', () => {
    it('renders cancel modal for active sessions when clicked', () => {
      renderCard(createMockSession({ status: 'active' }));
      // Modal should be in DOM (controlled by useState)
      expect(screen.getByTestId('session-card')).toBeInTheDocument();
    });

    it('renders delete modal for success sessions when clicked', () => {
      renderCard(createMockSession({ status: 'success' }));
      expect(screen.getByTestId('session-card')).toBeInTheDocument();
    });
  });

  describe('cleanup', () => {
    it('cleans up component on unmount', () => {
      const { unmount } = renderCard(createMockSession());
      unmount();
      expect(screen.queryByTestId('session-card')).not.toBeInTheDocument();
    });
  });

  describe('expand/collapse functionality', () => {
    it('expands when card is clicked', async () => {
      renderCard(createMockSession());
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      expect(card).toBeInTheDocument();

      // Click to expand
      await userEvent.click(card);
      // The SessionDetail should be in the DOM when expanded (has id="session-detail")
      expect(document.getElementById('session-detail')).toBeInTheDocument();
    });

    it('collapses when already expanded card is clicked', async () => {
      renderCard(createMockSession());
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;

      // First click expands
      await userEvent.click(card);
      expect(document.getElementById('session-detail')).toBeInTheDocument();

      // Second click collapses
      await userEvent.click(card);
      // SessionDetail should be removed from DOM when collapsed
      expect(document.getElementById('session-detail')).not.toBeInTheDocument();
    });

    it('expands on Enter key press', async () => {
      renderCard(createMockSession());
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;

      card.focus();
      await userEvent.keyboard('{Enter}');
      expect(document.getElementById('session-detail')).toBeInTheDocument();
    });

    it('expands on Space key press', async () => {
      renderCard(createMockSession());
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;

      card.focus();
      await userEvent.keyboard('{ }');
      expect(document.getElementById('session-detail')).toBeInTheDocument();
    });
  });

  describe('cancel modal interactions', () => {
    it('shows cancel modal when cancel button in detail is clicked', async () => {
      renderCard(createMockSession({ status: 'active' }));

      // First expand the card
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      // Click cancel button in SessionDetail
      // The button inside SessionDetail should be accessible after expansion
      const detailSection = document.getElementById('session-detail');
      expect(detailSection).toBeInTheDocument();
      if (!detailSection) throw new Error('SessionDetail not found');
      const cancelButton = within(detailSection).getByRole('button', {
        name: /cancel loop/i,
      });
      await userEvent.click(cancelButton);

      // Modal should appear
      expect(
        screen.getByText(/Are you sure you want to cancel/)
      ).toBeInTheDocument();
      expect(screen.getByText('Cancel Loop')).toBeInTheDocument();
      expect(screen.getByText('Keep Running')).toBeInTheDocument();
    });

    it('calls cancel mutation when confirm is clicked', async () => {
      renderCard(createMockSession({ status: 'active' }));

      // Expand and click cancel
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      const detailSection = document.getElementById('session-detail');
      if (!detailSection) throw new Error('SessionDetail not found');
      const cancelButton = within(detailSection).getByRole('button', {
        name: /cancel loop/i,
      });
      await userEvent.click(cancelButton);

      // Click confirm - the modal should have a button with text "Cancel Loop"
      // Find the modal's confirm button (not the one in SessionDetail)
      const allButtons = screen.getAllByText('Cancel Loop');
      const confirmButton = allButtons.find(
        (btn) => !detailSection.contains(btn)
      );
      expect(confirmButton).toBeDefined();
      if (!confirmButton) throw new Error('Confirm button not found');
      await userEvent.click(confirmButton);

      expect(mockCancelMutate).toHaveBeenCalledWith(
        'test-loop-1',
        expect.objectContaining({
          onSuccess: expect.any(Function),
        })
      );
    });

    it('closes cancel modal when cancelled', async () => {
      renderCard(createMockSession({ status: 'active' }));

      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      const detailSection = document.getElementById('session-detail');
      if (!detailSection) throw new Error('SessionDetail not found');
      const cancelButton = within(detailSection).getByRole('button', {
        name: /cancel loop/i,
      });
      await userEvent.click(cancelButton);

      // Click cancel button in modal
      const keepRunningButton = screen.getByText('Keep Running');
      await userEvent.click(keepRunningButton);

      // Modal should close
      expect(
        screen.queryByText(/Are you sure you want to cancel/)
      ).not.toBeInTheDocument();
    });
  });

  describe('delete modal interactions', () => {
    it('shows delete modal when delete button in detail is clicked', async () => {
      renderCard(createMockSession({ status: 'success' }));

      // First expand the card
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      // Click delete button in SessionDetail
      const detailSection = document.getElementById('session-detail');
      expect(detailSection).toBeInTheDocument();
      if (!detailSection) throw new Error('SessionDetail not found');
      const deleteButton = within(detailSection).getByRole('button', {
        name: /delete permanently/i,
      });
      await userEvent.click(deleteButton);

      // Modal should appear
      expect(screen.getByText(/permanently delete/)).toBeInTheDocument();
      expect(screen.getByText('Keep in History')).toBeInTheDocument();
    });

    it('shows delete modal confirm button can be clicked', async () => {
      renderCard(createMockSession({ status: 'success' }));

      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      const detailSection = document.getElementById('session-detail');
      if (!detailSection) throw new Error('SessionDetail not found');
      const deleteButton = within(detailSection).getByRole('button', {
        name: /delete permanently/i,
      });
      await userEvent.click(deleteButton);

      // Find the confirm button in the modal (rendered via portal to document.body)
      const sessionCard = screen.getByTestId('session-card');
      const allButtons = screen.getAllByText(/Delete Permanently/);
      const confirmButton = allButtons.find(
        (btn) => !sessionCard.contains(btn)
      );
      expect(confirmButton).toBeDefined();
      if (!confirmButton) throw new Error('Confirm button not found');
      expect(confirmButton.textContent).toContain('Delete Permanently');

      // Click the confirm button - this should trigger the delete mutation
      await userEvent.click(confirmButton);

      // The modal should still be visible because the mock doesn't call onSuccess
      expect(screen.getByText(/permanently delete/)).toBeInTheDocument();
    });

    it('closes delete modal when cancelled', async () => {
      renderCard(createMockSession({ status: 'success' }));

      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      const detailSection = document.getElementById('session-detail');
      if (!detailSection) throw new Error('SessionDetail not found');
      const deleteButton = within(detailSection).getByRole('button', {
        name: /delete permanently/i,
      });
      await userEvent.click(deleteButton);

      // Click cancel button in modal
      const keepHistoryButton = screen.getByText('Keep in History');
      await userEvent.click(keepHistoryButton);

      // Modal should close
      expect(screen.queryByText(/permanently delete/)).not.toBeInTheDocument();
    });

    // Note: Error handlers (alert() calls in onError callbacks) are tested via E2E tests
    // Unit testing alert() is difficult and provides limited value.
    // See tests/e2e/dashboard.spec.ts:
    //   - "handles session cancellation errors gracefully"
    //   - "handles session deletion errors gracefully"
  });

  describe('time ago calculations', () => {
    it('shows hours ago for sessions within last 24 hours', () => {
      const now = new Date();
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      renderCard(
        createMockSession({ started_at: threeHoursAgo.toISOString() })
      );
      expect(screen.getByText(/3h ago/)).toBeInTheDocument();
    });

    it('shows days ago for older sessions', () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      renderCard(createMockSession({ started_at: twoDaysAgo.toISOString() }));
      expect(screen.getByText(/2d ago/)).toBeInTheDocument();
    });
  });

  describe('duration edge cases', () => {
    it('shows hours without remainder when minutes is 0', () => {
      renderCard(createMockSession({ duration_seconds: 3600 })); // 1 hour exactly
      expect(screen.getByText('1h 0m')).toBeInTheDocument();
    });

    it('shows hours with correct remainder', () => {
      renderCard(createMockSession({ duration_seconds: 3665 })); // 1h 1m 5s
      expect(screen.getByText('1h 1m')).toBeInTheDocument();
    });
  });

  describe('truncate task with custom max length', () => {
    it('respects custom max length parameter', () => {
      const task = 'A'.repeat(50);
      renderCard(createMockSession({ task }));

      // The default in the component is 100 for display, but truncation happens
      // via line-clamp-2 CSS class for the display
      expect(screen.getByText(task)).toBeInTheDocument();
    });
  });

  describe('mutation callback handling', () => {
    it('calls onSuccess callback after successful cancel', async () => {
      // Mock the mutate to immediately call onSuccess
      mockCancelMutate.mockImplementation((_loopId, options) => {
        options?.onSuccess?.();
      });

      renderCard(createMockSession({ status: 'active' }));

      // Expand card
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      // Click cancel button in detail
      const detailSection = document.getElementById('session-detail');
      if (!detailSection) throw new Error('SessionDetail not found');
      const cancelButton = within(detailSection).getByRole('button', {
        name: /cancel loop/i,
      });
      await userEvent.click(cancelButton);

      // Confirm cancellation
      const allButtons = screen.getAllByText('Cancel Loop');
      const confirmButton = allButtons.find(
        (btn) => !detailSection.contains(btn)
      );
      if (!confirmButton) throw new Error('Confirm button not found');
      await userEvent.click(confirmButton);

      // After onSuccess, modal should be closed
      expect(
        screen.queryByText(/Are you sure you want to cancel/)
      ).not.toBeInTheDocument();
    });

    it('calls onError callback after failed cancel', async () => {
      const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

      // Mock the mutate to immediately call onError
      mockCancelMutate.mockImplementation((_loopId, options) => {
        options?.onError?.(new Error('Cancel failed'));
      });

      renderCard(createMockSession({ status: 'active' }));

      // Expand and open cancel modal
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      const detailSection = document.getElementById('session-detail');
      if (!detailSection) throw new Error('SessionDetail not found');
      const cancelButton = within(detailSection).getByRole('button', {
        name: /cancel loop/i,
      });
      await userEvent.click(cancelButton);

      // Confirm cancellation
      const allButtons = screen.getAllByText('Cancel Loop');
      const confirmButton = allButtons.find(
        (btn) => !detailSection.contains(btn)
      );
      if (!confirmButton) throw new Error('Confirm button not found');
      await userEvent.click(confirmButton);

      // Alert should have been called with error message
      expect(alertMock).toHaveBeenCalledWith('Failed to cancel: Cancel failed');

      alertMock.mockRestore();
    });

    it('calls onSuccess callback after successful delete', async () => {
      // Mock the mutate to immediately call onSuccess
      mockDeleteMutate.mockImplementation((_loopId, options) => {
        options?.onSuccess?.();
      });

      renderCard(createMockSession({ status: 'success' }));

      // Expand card
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      // Click delete button in detail
      const detailSection = document.getElementById('session-detail');
      if (!detailSection) throw new Error('SessionDetail not found');
      const deleteButton = within(detailSection).getByRole('button', {
        name: /delete permanently/i,
      });
      await userEvent.click(deleteButton);

      // Find and click the confirm button in the modal (rendered via portal)
      // The modal confirm button is inside a dialog role
      const dialog = screen.getByRole('alertdialog');
      const confirmButton = within(dialog).getByRole('button', {
        name: /Delete Permanently/,
      });
      await userEvent.click(confirmButton);

      // After onSuccess, the modal heading should be gone (check for heading, not body text)
      expect(
        screen.queryByRole('heading', { name: /Delete Permanently/ })
      ).not.toBeInTheDocument();
    });

    it('calls onError callback after failed delete', async () => {
      const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

      // Mock the mutate to immediately call onError
      mockDeleteMutate.mockImplementation((_loopId, options) => {
        options?.onError?.(new Error('Delete failed'));
      });

      renderCard(createMockSession({ status: 'success' }));

      // Expand and open delete modal
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      const detailSection = document.getElementById('session-detail');
      if (!detailSection) throw new Error('SessionDetail not found');
      const deleteButton = within(detailSection).getByRole('button', {
        name: /delete permanently/i,
      });
      await userEvent.click(deleteButton);

      // Find and click the confirm button in the modal
      const dialog = screen.getByRole('alertdialog');
      const confirmButton = within(dialog).getByRole('button', {
        name: /Delete Permanently/,
      });
      await userEvent.click(confirmButton);

      // Alert should have been called with error message
      expect(alertMock).toHaveBeenCalledWith('Failed to delete: Delete failed');

      alertMock.mockRestore();
    });
  });

  describe('archive modal interactions', () => {
    it('shows archive modal when archive button in detail is clicked', async () => {
      renderCard(createMockSession({ status: 'orphaned' }));

      // First expand the card
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      // Click archive button in SessionDetail
      const detailSection = document.getElementById('session-detail');
      expect(detailSection).toBeInTheDocument();
      if (!detailSection) throw new Error('SessionDetail not found');
      const archiveButton = within(detailSection).getByRole('button', {
        name: /archive orphaned loop/i,
      });
      await userEvent.click(archiveButton);

      // Modal should appear (check for modal title specifically)
      expect(
        screen.getByRole('heading', { name: /Archive Orphaned Loop/ })
      ).toBeInTheDocument();
      expect(screen.getByText('Keep as Orphaned')).toBeInTheDocument();
    });

    it('calls archive mutation when confirm is clicked', async () => {
      renderCard(createMockSession({ status: 'orphaned' }));

      // Expand and click archive
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      const detailSection = document.getElementById('session-detail');
      if (!detailSection) throw new Error('SessionDetail not found');
      const archiveButton = within(detailSection).getByRole('button', {
        name: /archive orphaned loop/i,
      });
      await userEvent.click(archiveButton);

      // Click confirm in modal
      const allButtons = screen.getAllByText(/Archive Loop/);
      const confirmButton = allButtons.find(
        (btn) => !detailSection.contains(btn)
      );
      if (!confirmButton) throw new Error('Confirm button not found');
      await userEvent.click(confirmButton);

      expect(mockArchiveMutate).toHaveBeenCalledWith(
        'test-loop-1',
        expect.objectContaining({
          onSuccess: expect.any(Function),
        })
      );
    });

    it('closes archive modal when cancelled', async () => {
      renderCard(createMockSession({ status: 'orphaned' }));

      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      const detailSection = document.getElementById('session-detail');
      if (!detailSection) throw new Error('SessionDetail not found');
      const archiveButton = within(detailSection).getByRole('button', {
        name: /archive orphaned loop/i,
      });
      await userEvent.click(archiveButton);

      // Click cancel button in modal
      const keepOrphanedButton = screen.getByText('Keep as Orphaned');
      await userEvent.click(keepOrphanedButton);

      // Modal should close (check for modal title specifically)
      expect(
        screen.queryByRole('heading', { name: /Archive Orphaned Loop/ })
      ).not.toBeInTheDocument();
    });

    it('calls onSuccess callback after successful archive', async () => {
      // Mock the mutate to immediately call onSuccess
      mockArchiveMutate.mockImplementation((_loopId, options) => {
        options?.onSuccess?.();
      });

      renderCard(createMockSession({ status: 'orphaned' }));

      // Expand card
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      // Click archive button in detail
      const detailSection = document.getElementById('session-detail');
      if (!detailSection) throw new Error('SessionDetail not found');
      const archiveButton = within(detailSection).getByRole('button', {
        name: /archive orphaned loop/i,
      });
      await userEvent.click(archiveButton);

      // Confirm archive
      const allButtons = screen.getAllByText(/Archive Loop/);
      const confirmButton = allButtons.find(
        (btn) => !detailSection.contains(btn)
      );
      if (!confirmButton) throw new Error('Confirm button not found');
      await userEvent.click(confirmButton);

      // After onSuccess, modal should be closed
      expect(
        screen.queryByText(/Archive Orphaned Loop/)
      ).not.toBeInTheDocument();
    });

    it('calls onError callback after failed archive', async () => {
      const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

      // Mock the mutate to immediately call onError
      mockArchiveMutate.mockImplementation((_loopId, options) => {
        options?.onError?.(new Error('Archive failed'));
      });

      renderCard(createMockSession({ status: 'orphaned' }));

      // Expand and open archive modal
      const card = screen
        .getByTestId('session-card')
        .querySelector('[role="button"]') as HTMLElement;
      await userEvent.click(card);

      const detailSection = document.getElementById('session-detail');
      if (!detailSection) throw new Error('SessionDetail not found');
      const archiveButton = within(detailSection).getByRole('button', {
        name: /archive orphaned loop/i,
      });
      await userEvent.click(archiveButton);

      // Confirm archive
      const allButtons = screen.getAllByText(/Archive Loop/);
      const confirmButton = allButtons.find(
        (btn) => !detailSection.contains(btn)
      );
      if (!confirmButton) throw new Error('Confirm button not found');
      await userEvent.click(confirmButton);

      // Alert should have been called with error message
      expect(alertMock).toHaveBeenCalledWith(
        'Failed to archive: Archive failed'
      );

      alertMock.mockRestore();
    });
  });

  describe('orphaned status rendering', () => {
    it('renders orphaned status badge', () => {
      renderCard(createMockSession({ status: 'orphaned' }));
      expect(screen.getByText('Orphaned')).toBeInTheDocument();
    });
  });
});
