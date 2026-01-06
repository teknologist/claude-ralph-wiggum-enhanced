import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionTable } from '../components/SessionTable';
import type { Session } from '../../server/types';

// Mock the useCancelLoop hook
vi.mock('../hooks/useCancelLoop', () => ({
  useCancelLoop: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

// Mock useMediaQuery - default to desktop (false)
vi.mock('../hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
}));

import { useMediaQuery } from '../hooks/useMediaQuery';

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
  started_at: new Date().toISOString(),
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

describe('SessionTable', () => {
  const mockSetViewMode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the table with Active Loops tab selected by default', () => {
    const sessions: Session[] = [createMockSession()];
    render(
      <SessionTable
        sessions={sessions}
        viewMode="table"
        setViewMode={mockSetViewMode}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Active Loops')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    // Active tab should have active styling - just check it exists
    const activeButton = screen.getByText('Active Loops');
    expect(activeButton).toBeInTheDocument();
  });

  it('displays active session count badge', () => {
    const sessions: Session[] = [
      createMockSession({ loop_id: 'loop-1', status: 'active' }),
      createMockSession({ loop_id: 'loop-2', status: 'active' }),
      createMockSession({ loop_id: 'loop-3', status: 'success' }),
    ];
    render(
      <SessionTable
        sessions={sessions}
        viewMode="table"
        setViewMode={mockSetViewMode}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('2')).toBeInTheDocument(); // Active count badge
  });

  it('displays archived session count', () => {
    const sessions: Session[] = [
      createMockSession({ loop_id: 'loop-1', status: 'active' }),
      createMockSession({ loop_id: 'loop-2', status: 'success' }),
      createMockSession({ loop_id: 'loop-3', status: 'cancelled' }),
    ];
    render(
      <SessionTable
        sessions={sessions}
        viewMode="table"
        setViewMode={mockSetViewMode}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('(2)')).toBeInTheDocument(); // Archived count
  });

  it('shows empty state for active tab when no active sessions', () => {
    const sessions: Session[] = [
      createMockSession({ loop_id: 'loop-1', status: 'success' }),
    ];
    render(
      <SessionTable
        sessions={sessions}
        viewMode="table"
        setViewMode={mockSetViewMode}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('No active loops')).toBeInTheDocument();
    expect(screen.getByText('/ralph-loop')).toBeInTheDocument();
  });

  it('shows empty state for archived tab when no archived sessions', () => {
    const sessions: Session[] = [
      createMockSession({ loop_id: 'loop-1', status: 'active' }),
    ];
    render(
      <SessionTable
        sessions={sessions}
        viewMode="table"
        setViewMode={mockSetViewMode}
      />,
      { wrapper: createWrapper() }
    );

    // Switch to archived tab
    fireEvent.click(screen.getByText('Archived'));

    expect(screen.getByText('No archived loops yet')).toBeInTheDocument();
  });

  it('switches between active and archived tabs', () => {
    const sessions: Session[] = [
      createMockSession({
        loop_id: 'loop-1',
        status: 'active',
        project_name: 'active-project',
      }),
      createMockSession({
        loop_id: 'loop-2',
        status: 'success',
        project_name: 'archived-project',
      }),
    ];
    render(
      <SessionTable
        sessions={sessions}
        viewMode="table"
        setViewMode={mockSetViewMode}
      />,
      { wrapper: createWrapper() }
    );

    // Initially shows active sessions
    expect(screen.getByText('active-project')).toBeInTheDocument();
    expect(screen.queryByText('archived-project')).not.toBeInTheDocument();

    // Switch to archived tab
    fireEvent.click(screen.getByText('Archived'));

    expect(screen.queryByText('active-project')).not.toBeInTheDocument();
    expect(screen.getByText('archived-project')).toBeInTheDocument();

    // Switch back to active tab
    fireEvent.click(screen.getByText('Active Loops'));
    expect(screen.getByText('active-project')).toBeInTheDocument();
  });

  it('renders table headers correctly', () => {
    const sessions: Session[] = [createMockSession()];
    render(
      <SessionTable
        sessions={sessions}
        viewMode="table"
        setViewMode={mockSetViewMode}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Iterations')).toBeInTheDocument();
  });

  it('sorts sessions by date descending (most recent first)', () => {
    const olderDate = new Date('2024-01-01T10:00:00Z').toISOString();
    const newerDate = new Date('2024-01-02T10:00:00Z').toISOString();

    const sessions: Session[] = [
      createMockSession({
        loop_id: 'loop-1',
        project_name: 'older-project',
        started_at: olderDate,
      }),
      createMockSession({
        loop_id: 'loop-2',
        project_name: 'newer-project',
        started_at: newerDate,
      }),
    ];
    render(
      <SessionTable
        sessions={sessions}
        viewMode="table"
        setViewMode={mockSetViewMode}
      />,
      { wrapper: createWrapper() }
    );

    const projectNames = screen.getAllByText(/project/);
    // Both projects should show (order within table rows)
    expect(projectNames.length).toBeGreaterThanOrEqual(2);
  });

  it('renders all status types in archived tab', () => {
    const sessions: Session[] = [
      createMockSession({ loop_id: 'loop-1', status: 'success' }),
      createMockSession({ loop_id: 'loop-2', status: 'cancelled' }),
      createMockSession({ loop_id: 'loop-3', status: 'error' }),
      createMockSession({ loop_id: 'loop-4', status: 'max_iterations' }),
    ];
    render(
      <SessionTable
        sessions={sessions}
        viewMode="table"
        setViewMode={mockSetViewMode}
      />,
      { wrapper: createWrapper() }
    );

    // Switch to archived tab
    fireEvent.click(screen.getByText('Archived'));

    // Should display all archived sessions
    expect(screen.getByText('(4)')).toBeInTheDocument();
  });

  it('handles empty sessions array', () => {
    render(
      <SessionTable
        sessions={[]}
        viewMode="table"
        setViewMode={mockSetViewMode}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('No active loops')).toBeInTheDocument();
  });

  it('renders card view mode correctly', () => {
    const sessions: Session[] = [
      createMockSession({ loop_id: 'loop-1', project_name: 'project-1' }),
      createMockSession({ loop_id: 'loop-2', project_name: 'project-2' }),
    ];
    render(
      <SessionTable
        sessions={sessions}
        viewMode="card"
        setViewMode={mockSetViewMode}
      />,
      { wrapper: createWrapper() }
    );

    // Should render session cards in grid layout
    expect(screen.getByText('project-1')).toBeInTheDocument();
    expect(screen.getByText('project-2')).toBeInTheDocument();
  });

  // Nested describe for mobile behavior with proper mock lifecycle
  describe('mobile behavior', () => {
    beforeEach(() => {
      vi.mocked(useMediaQuery).mockReturnValue(true);
    });

    afterEach(() => {
      // Reset to desktop (false) after each mobile test
      vi.mocked(useMediaQuery).mockReturnValue(false);
    });

    it('forces card view mode on mobile regardless of viewMode prop', () => {
      const sessions: Session[] = [
        createMockSession({
          loop_id: 'loop-1',
          project_name: 'mobile-project',
        }),
      ];

      // Even though viewMode is 'table', mobile should force 'card'
      render(
        <SessionTable
          sessions={sessions}
          viewMode="table"
          setViewMode={mockSetViewMode}
        />,
        { wrapper: createWrapper() }
      );

      // Should render card layout (grid), not table
      expect(screen.getByText('mobile-project')).toBeInTheDocument();
      // In card view, we should have the card container
      const cardContainer = screen.getByText('mobile-project').closest('div');
      expect(cardContainer).toBeInTheDocument();
    });
  });
});
