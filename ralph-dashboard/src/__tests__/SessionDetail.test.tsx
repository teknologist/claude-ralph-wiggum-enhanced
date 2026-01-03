import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionDetail } from '../components/SessionDetail';
import type { Session } from '../../server/types';

const createMockSession = (overrides: Partial<Session> = {}): Session => ({
  session_id: 'test-session-1',
  status: 'active',
  project: '/path/to/project',
  project_name: 'test-project',
  state_file_path: '/path/to/state-file.md',
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

describe('SessionDetail', () => {
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic rendering', () => {
    it('renders task description', () => {
      render(
        <SessionDetail
          session={createMockSession({ task: 'My important task' })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('My important task')).toBeInTheDocument();
    });

    it('shows "No task description" for empty task', () => {
      render(
        <SessionDetail
          session={createMockSession({ task: '' })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('No task description')).toBeInTheDocument();
    });

    it('renders completion promise', () => {
      render(
        <SessionDetail
          session={createMockSession({ completion_promise: 'DONE' })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('DONE')).toBeInTheDocument();
    });

    it('shows "None set" for null completion promise', () => {
      render(
        <SessionDetail
          session={createMockSession({ completion_promise: null })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('None set')).toBeInTheDocument();
    });

    it('renders project path', () => {
      render(
        <SessionDetail
          session={createMockSession({ project: '/home/user/my-project' })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('/home/user/my-project')).toBeInTheDocument();
    });

    it('renders iterations correctly', () => {
      render(
        <SessionDetail
          session={createMockSession({ iterations: 7, max_iterations: 20 })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('7 / 20')).toBeInTheDocument();
    });

    it('shows N/A for null iterations', () => {
      render(
        <SessionDetail
          session={createMockSession({ iterations: null })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });

    it('shows 0 iterations correctly (not as N/A)', () => {
      render(
        <SessionDetail
          session={createMockSession({ iterations: 0, max_iterations: 10 })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('0 / 10')).toBeInTheDocument();
    });
  });

  describe('duration formatting', () => {
    it('formats seconds duration', () => {
      render(
        <SessionDetail
          session={createMockSession({ duration_seconds: 45 })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('45s')).toBeInTheDocument();
    });

    it('formats minutes and seconds', () => {
      render(
        <SessionDetail
          session={createMockSession({ duration_seconds: 185 })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('3m 5s')).toBeInTheDocument();
    });

    it('formats hours and minutes', () => {
      render(
        <SessionDetail
          session={createMockSession({ duration_seconds: 3660 })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('1h 1m')).toBeInTheDocument();
    });

    it('shows "In progress..." for undefined duration', () => {
      render(
        <SessionDetail
          session={createMockSession({
            duration_seconds: undefined as unknown as number,
          })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('In progress...')).toBeInTheDocument();
    });
  });

  describe('active session features', () => {
    it('shows state file path for active sessions', () => {
      render(
        <SessionDetail
          session={createMockSession({
            status: 'active',
            state_file_path: '/home/.claude/ralph-loop.abc.local.md',
          })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('State File')).toBeInTheDocument();
      expect(
        screen.getByText('/home/.claude/ralph-loop.abc.local.md')
      ).toBeInTheDocument();
    });

    it('shows cancel button for active sessions', () => {
      render(
        <SessionDetail
          session={createMockSession({ status: 'active' })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('⏹ Cancel Loop')).toBeInTheDocument();
    });

    it('does not show cancel button for non-active sessions', () => {
      render(
        <SessionDetail
          session={createMockSession({ status: 'success' })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.queryByText('⏹ Cancel Loop')).not.toBeInTheDocument();
    });

    it('does not show state file for non-active sessions', () => {
      render(
        <SessionDetail
          session={createMockSession({ status: 'success' })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.queryByText('State File')).not.toBeInTheDocument();
    });

    it('calls onCancel when cancel button is clicked', () => {
      render(
        <SessionDetail
          session={createMockSession({ status: 'active' })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      fireEvent.click(screen.getByText('⏹ Cancel Loop'));
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('disables cancel button when isCancelling is true', () => {
      render(
        <SessionDetail
          session={createMockSession({ status: 'active' })}
          onCancel={mockOnCancel}
          isCancelling={true}
        />
      );
      const button = screen.getByText('Cancelling...').closest('button');
      expect(button).toBeDisabled();
    });

    it('shows loading state when isCancelling', () => {
      render(
        <SessionDetail
          session={createMockSession({ status: 'active' })}
          onCancel={mockOnCancel}
          isCancelling={true}
        />
      );
      expect(screen.getByText('Cancelling...')).toBeInTheDocument();
    });
  });

  describe('error display', () => {
    it('shows error reason when present', () => {
      render(
        <SessionDetail
          session={createMockSession({
            status: 'error',
            error_reason: 'Something went wrong',
          })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('does not show error section when no error_reason', () => {
      render(
        <SessionDetail
          session={createMockSession({ error_reason: null })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      const errorLabels = screen.queryAllByText('Error');
      // Should not have the Error label in detail section
      expect(errorLabels.length).toBe(0);
    });
  });

  describe('labels', () => {
    it('renders all section labels', () => {
      render(
        <SessionDetail
          session={createMockSession({ status: 'active' })}
          onCancel={mockOnCancel}
          isCancelling={false}
        />
      );
      expect(screen.getByText('Task')).toBeInTheDocument();
      expect(screen.getByText('Completion Promise')).toBeInTheDocument();
      expect(screen.getByText('Project Path')).toBeInTheDocument();
      expect(screen.getByText('Started')).toBeInTheDocument();
      expect(screen.getByText('Duration')).toBeInTheDocument();
      expect(screen.getByText('Iterations')).toBeInTheDocument();
    });
  });
});
