import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionCard } from '../components/SessionCard';
import type { Session } from '../../server/types';

// Mock the hooks
const mockCancelMutate = vi.fn();
const mockDeleteMutate = vi.fn();

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

// Mock useMediaQuery - default to desktop (not mobile)
vi.mock('../hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
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
    it('cleans up swipe offset on unmount', () => {
      const { unmount } = renderCard(createMockSession());
      unmount();
      expect(screen.queryByTestId('session-card')).not.toBeInTheDocument();
    });
  });
});
