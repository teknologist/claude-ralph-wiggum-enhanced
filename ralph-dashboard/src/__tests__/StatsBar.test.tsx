import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsBar } from '../components/StatsBar';
import type { Session } from '../../server/types';

describe('StatsBar', () => {
  const mockSessions: Session[] = [
    {
      loop_id: 'loop-active-1',
      session_id: 'active-1',
      status: 'active',
      project: '/test/project1',
      project_name: 'project1',
      state_file_path: '/test/project1/.claude/state.md',
      task: 'Active task',
      started_at: '2024-01-15T10:00:00Z',
      ended_at: null,
      duration_seconds: 600,
      iterations: null,
      max_iterations: 10,
      completion_promise: null,
      error_reason: null,
      has_checklist: false,
      checklist_progress: null,
    },
    {
      loop_id: 'loop-success-1',
      session_id: 'success-1',
      status: 'success',
      outcome: 'success',
      project: '/test/project2',
      project_name: 'project2',
      state_file_path: '/test/project2/.claude/state.md',
      task: 'Completed task',
      started_at: '2024-01-15T09:00:00Z',
      ended_at: '2024-01-15T09:30:00Z',
      duration_seconds: 1800,
      iterations: 5,
      max_iterations: 10,
      completion_promise: null,
      error_reason: null,
      has_checklist: false,
      checklist_progress: null,
    },
    {
      loop_id: 'loop-cancelled-1',
      session_id: 'cancelled-1',
      status: 'cancelled',
      outcome: 'cancelled',
      project: '/test/project3',
      project_name: 'project3',
      state_file_path: '/test/project3/.claude/state.md',
      task: 'Cancelled task',
      started_at: '2024-01-15T08:00:00Z',
      ended_at: '2024-01-15T08:15:00Z',
      duration_seconds: 900,
      iterations: 3,
      max_iterations: 10,
      completion_promise: null,
      error_reason: null,
      has_checklist: false,
      checklist_progress: null,
    },
  ];

  it('should display total loops count', () => {
    render(<StatsBar sessions={mockSessions} activeCount={1} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Total Loops')).toBeInTheDocument();
  });

  it('should display active count', () => {
    render(<StatsBar sessions={mockSessions} activeCount={1} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should display success rate', () => {
    render(<StatsBar sessions={mockSessions} activeCount={1} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('should display average duration', () => {
    render(<StatsBar sessions={mockSessions} activeCount={1} />);
    expect(screen.getByText('Avg Duration')).toBeInTheDocument();
  });

  it('should handle empty sessions', () => {
    render(<StatsBar sessions={[]} activeCount={0} />);
    expect(screen.getByText('Total Loops')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });

  it('should format average duration in hours for long sessions', () => {
    const longSessions: Session[] = [
      {
        loop_id: 'loop-long-1',
        session_id: 'long-1',
        status: 'success',
        outcome: 'success',
        project: '/test/project',
        project_name: 'project',
        state_file_path: '/test/.claude/state.md',
        task: 'Long task',
        started_at: '2024-01-15T09:00:00Z',
        ended_at: '2024-01-15T12:30:00Z',
        duration_seconds: 7200, // 2 hours
        iterations: 5,
        max_iterations: 10,
        completion_promise: null,
        error_reason: null,
        has_checklist: false,
        checklist_progress: null,
      },
    ];
    render(<StatsBar sessions={longSessions} activeCount={0} />);
    // Average duration should be shown in hours format
    expect(screen.getByText('2h 0m')).toBeInTheDocument();
  });

  it('should handle sessions with undefined duration_seconds', () => {
    const sessionWithNoDuration: Session[] = [
      {
        loop_id: 'loop-no-duration-1',
        session_id: 'no-duration-1',
        status: 'success',
        outcome: 'success',
        project: '/test/project',
        project_name: 'project',
        state_file_path: '/test/.claude/state.md',
        task: 'Task with no duration',
        started_at: '2024-01-15T09:00:00Z',
        ended_at: '2024-01-15T09:10:00Z',
        duration_seconds: undefined as unknown as number,
        iterations: 5,
        max_iterations: 10,
        completion_promise: null,
        error_reason: null,
        has_checklist: false,
        checklist_progress: null,
      },
    ];
    render(<StatsBar sessions={sessionWithNoDuration} activeCount={0} />);
    // Should handle undefined duration gracefully (treats as 0)
    expect(screen.getByText('0s')).toBeInTheDocument();
  });
});
