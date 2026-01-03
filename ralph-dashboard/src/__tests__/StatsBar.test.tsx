import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsBar } from '../components/StatsBar';
import type { Session } from '../../server/types';

describe('StatsBar', () => {
  const mockSessions: Session[] = [
    {
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
    },
    {
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
    },
    {
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
      },
    ];
    render(<StatsBar sessions={longSessions} activeCount={0} />);
    // Average duration should be shown in hours format
    expect(screen.getByText('2h 0m')).toBeInTheDocument();
  });
});
