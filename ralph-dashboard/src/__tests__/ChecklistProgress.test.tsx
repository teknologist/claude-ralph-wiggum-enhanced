import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChecklistProgress } from '../components/ChecklistProgress';
import type { ChecklistResponse } from '../../server/types';

// Mock the useChecklist hook
vi.mock('../hooks/useChecklist', () => ({
  useChecklist: vi.fn(),
}));

const { useChecklist } = await import('../hooks/useChecklist');
const mockUseChecklist = vi.mocked(useChecklist);

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

const mockChecklistResponse: ChecklistResponse = {
  checklist: {
    loop_id: 'test-loop-123',
    session_id: 'session-abc',
    project: '/path/to/project',
    project_name: 'test-project',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    completion_criteria: [
      {
        id: 'criteria-1',
        text: 'First criteria',
        status: 'completed',
        created_at: '2024-01-15T10:00:00Z',
        completed_at: '2024-01-15T10:30:00Z',
        completed_iteration: 5,
      },
      {
        id: 'criteria-2',
        text: 'Second criteria',
        status: 'in_progress',
        created_at: '2024-01-15T10:00:00Z',
        completed_at: null,
        completed_iteration: null,
      },
      {
        id: 'criteria-3',
        text: 'Third criteria',
        status: 'pending',
        created_at: '2024-01-15T10:00:00Z',
        completed_at: null,
        completed_iteration: null,
      },
    ],
  },
  progress: {
    criteria: '1/3 criteria',
    criteriaCompleted: 1,
    criteriaTotal: 3,
  },
};

describe('ChecklistProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows loading spinner when isLoading is true', () => {
      mockUseChecklist.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByText('Loading checklist...')).toBeInTheDocument();
    });

    it('does not show checklist content when loading', () => {
      mockUseChecklist.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      expect(screen.queryByText('Acceptance Criteria')).not.toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message when isError is true', () => {
      const error = new Error('Failed to fetch');
      mockUseChecklist.mockReturnValue({
        data: undefined,
        isLoading: false,
        error,
        isError: true,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      expect(
        screen.getByText(/Failed to load checklist: Failed to fetch/)
      ).toBeInTheDocument();
    });

    it('displays error message correctly', () => {
      const error = new Error('Network error');
      mockUseChecklist.mockReturnValue({
        data: undefined,
        isLoading: false,
        error,
        isError: true,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      expect(
        screen.getByText(/Failed to load checklist: Network error/)
      ).toBeInTheDocument();
    });
  });

  describe('null checklist state', () => {
    it('returns null when checklist is null', () => {
      mockUseChecklist.mockReturnValue({
        data: { checklist: null, progress: null },
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      const { container } = render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      // Container should be empty when checklist is null
      expect(container.firstChild).toBeNull();
    });

    it('returns null when data is undefined', () => {
      mockUseChecklist.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      const { container } = render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      expect(container.firstChild).toBeNull();
    });
  });

  describe('with criteria', () => {
    it('renders checklist header', () => {
      mockUseChecklist.mockReturnValue({
        data: mockChecklistResponse,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByText('Acceptance Criteria')).toBeInTheDocument();
    });

    it('renders progress summary', () => {
      mockUseChecklist.mockReturnValue({
        data: mockChecklistResponse,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByText('1/3 criteria')).toBeInTheDocument();
    });

    it('renders all criteria items', () => {
      mockUseChecklist.mockReturnValue({
        data: mockChecklistResponse,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByText('First criteria')).toBeInTheDocument();
      expect(screen.getByText('Second criteria')).toBeInTheDocument();
      expect(screen.getByText('Third criteria')).toBeInTheDocument();
    });
  });

  describe('status badges', () => {
    it('renders Completed status badge', () => {
      mockUseChecklist.mockReturnValue({
        data: mockChecklistResponse,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      const completedBadges = screen.getAllByText('Completed');
      expect(completedBadges.length).toBeGreaterThan(0);
    });

    it('renders In Progress status badge', () => {
      mockUseChecklist.mockReturnValue({
        data: mockChecklistResponse,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('renders Pending status badge', () => {
      mockUseChecklist.mockReturnValue({
        data: mockChecklistResponse,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      const pendingBadges = screen.getAllByText('Pending');
      expect(pendingBadges.length).toBeGreaterThan(0);
    });
  });

  describe('empty checklist', () => {
    it('shows empty message when no items', () => {
      const baseChecklist = mockChecklistResponse.checklist;
      if (!baseChecklist)
        throw new Error('mockChecklistResponse.checklist is null');

      const emptyResponse: ChecklistResponse = {
        checklist: {
          loop_id: baseChecklist.loop_id,
          session_id: baseChecklist.session_id,
          project: baseChecklist.project,
          project_name: baseChecklist.project_name,
          created_at: baseChecklist.created_at,
          updated_at: baseChecklist.updated_at,
          completion_criteria: [],
        },
        progress: {
          criteria: '0/0 criteria',
          criteriaCompleted: 0,
          criteriaTotal: 0,
        },
      };

      mockUseChecklist.mockReturnValue({
        data: emptyResponse,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      expect(
        screen.getByText('No acceptance criteria defined yet')
      ).toBeInTheDocument();
    });

    it('renders nothing when all items are TODO placeholders', () => {
      const baseChecklist = mockChecklistResponse.checklist;
      if (!baseChecklist)
        throw new Error('mockChecklistResponse.checklist is null');

      const placeholderResponse: ChecklistResponse = {
        checklist: {
          loop_id: baseChecklist.loop_id,
          session_id: baseChecklist.session_id,
          project: baseChecklist.project,
          project_name: baseChecklist.project_name,
          created_at: baseChecklist.created_at,
          updated_at: baseChecklist.updated_at,
          completion_criteria: [
            {
              id: 'c1',
              text: 'TODO: Define acceptance criterion 1',
              status: 'pending',
              created_at: '2024-01-15T10:30:00Z',
              completed_at: null,
              completed_iteration: null,
            },
            {
              id: 'c2',
              text: 'TODO: Define acceptance criterion 2',
              status: 'pending',
              created_at: '2024-01-15T10:30:00Z',
              completed_at: null,
              completed_iteration: null,
            },
          ],
        },
        progress: {
          criteria: '0/2 criteria',
          criteriaCompleted: 0,
          criteriaTotal: 2,
        },
      };

      mockUseChecklist.mockReturnValue({
        data: placeholderResponse,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      const { container } = render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      // TODO placeholder checklists render nothing (hidden until agent populates)
      expect(container.firstChild).toBeNull();
    });
  });

  describe('completed iteration display', () => {
    it('shows completed iteration when present', () => {
      mockUseChecklist.mockReturnValue({
        data: mockChecklistResponse,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      // Use getAllByText since multiple items may have the same iteration count
      const iterationTexts = screen.getAllByText(/Completed in iteration/);
      expect(iterationTexts.length).toBeGreaterThan(0);
    });

    it('does not show iteration for non-completed items', () => {
      const baseChecklist = mockChecklistResponse.checklist;
      if (!baseChecklist)
        throw new Error('mockChecklistResponse.checklist is null');

      const response: ChecklistResponse = {
        checklist: {
          loop_id: baseChecklist.loop_id,
          session_id: baseChecklist.session_id,
          project: baseChecklist.project,
          project_name: baseChecklist.project_name,
          created_at: baseChecklist.created_at,
          updated_at: baseChecklist.updated_at,
          completion_criteria: [
            {
              id: 'criteria-1',
              text: 'Pending criteria',
              status: 'pending',
              created_at: '2024-01-15T10:00:00Z',
              completed_at: null,
              completed_iteration: null,
            },
          ],
        },
        progress: {
          criteria: '0/1 criteria',
          criteriaCompleted: 0,
          criteriaTotal: 1,
        },
      };

      mockUseChecklist.mockReturnValue({
        data: response,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      expect(
        screen.queryByText(/Completed in iteration/)
      ).not.toBeInTheDocument();
    });
  });

  describe('progress summary display', () => {
    it('calculates correct progress summary', () => {
      mockUseChecklist.mockReturnValue({
        data: mockChecklistResponse,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByText('1/3 criteria')).toBeInTheDocument();
    });

    it('hides progress summary when no items', () => {
      const baseChecklist = mockChecklistResponse.checklist;
      if (!baseChecklist)
        throw new Error('mockChecklistResponse.checklist is null');

      const emptyResponse: ChecklistResponse = {
        checklist: {
          loop_id: baseChecklist.loop_id,
          session_id: baseChecklist.session_id,
          project: baseChecklist.project,
          project_name: baseChecklist.project_name,
          created_at: baseChecklist.created_at,
          updated_at: baseChecklist.updated_at,
          completion_criteria: [],
        },
        progress: {
          criteria: '0/0 criteria',
          criteriaCompleted: 0,
          criteriaTotal: 0,
        },
      };

      mockUseChecklist.mockReturnValue({
        data: emptyResponse,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ChecklistProgress loopId="test-loop" />, {
        wrapper: createWrapper(),
      });

      // Progress summary should not be shown when there are no items
      const progressSummary = screen.queryByText(/\d+\/\d+ criteria/);
      expect(progressSummary).not.toBeInTheDocument();
    });
  });
});
