import { describe, it, expect } from 'vitest';
import { mergeSessions } from '../services/log-parser';
import type { LogEntry, StartLogEntry, CompletionLogEntry } from '../types';

describe('log-parser', () => {
  describe('mergeSessions', () => {
    it('should return empty array for empty entries', () => {
      const result = mergeSessions([]);
      expect(result).toEqual([]);
    });

    it('should create active session from start entry only', () => {
      const startEntry: StartLogEntry = {
        session_id: 'test-123',
        status: 'active',
        project: '/Users/test/project',
        project_name: 'project',
        state_file_path:
          '/Users/test/project/.claude/ralph-loop.test-123.local.md',
        task: 'Test task',
        started_at: new Date().toISOString(),
        max_iterations: 10,
        completion_promise: 'Complete the test',
      };

      const result = mergeSessions([startEntry]);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('active');
      expect(result[0].session_id).toBe('test-123');
      expect(result[0].project_name).toBe('project');
      expect(result[0].iterations).toBeNull();
      expect(result[0].ended_at).toBeNull();
    });

    it('should merge start and completion entries', () => {
      const startedAt = '2024-01-15T10:00:00Z';
      const endedAt = '2024-01-15T10:15:00Z';

      const startEntry: StartLogEntry = {
        session_id: 'test-456',
        status: 'active',
        project: '/Users/test/project',
        project_name: 'project',
        state_file_path:
          '/Users/test/project/.claude/ralph-loop.test-456.local.md',
        task: 'Implement feature',
        started_at: startedAt,
        max_iterations: 5,
        completion_promise: 'Feature is complete',
      };

      const completionEntry: CompletionLogEntry = {
        session_id: 'test-456',
        status: 'completed',
        outcome: 'success',
        ended_at: endedAt,
        duration_seconds: 900,
        iterations: 3,
      };

      const result = mergeSessions([startEntry, completionEntry]);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('success');
      expect(result[0].ended_at).toBe(endedAt);
      expect(result[0].duration_seconds).toBe(900);
      expect(result[0].iterations).toBe(3);
    });

    it('should handle cancelled sessions', () => {
      const startEntry: StartLogEntry = {
        session_id: 'cancelled-123',
        status: 'active',
        project: '/Users/test/project',
        project_name: 'project',
        state_file_path:
          '/Users/test/project/.claude/ralph-loop.cancelled-123.local.md',
        task: 'Task to cancel',
        started_at: '2024-01-15T10:00:00Z',
        max_iterations: 10,
        completion_promise: null,
      };

      const completionEntry: CompletionLogEntry = {
        session_id: 'cancelled-123',
        status: 'completed',
        outcome: 'cancelled',
        ended_at: '2024-01-15T10:05:00Z',
        duration_seconds: 300,
        iterations: 2,
      };

      const result = mergeSessions([startEntry, completionEntry]);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('cancelled');
    });

    it('should handle error sessions', () => {
      const startEntry: StartLogEntry = {
        session_id: 'error-123',
        status: 'active',
        project: '/Users/test/project',
        project_name: 'project',
        state_file_path:
          '/Users/test/project/.claude/ralph-loop.error-123.local.md',
        task: 'Task with error',
        started_at: '2024-01-15T10:00:00Z',
        max_iterations: 10,
        completion_promise: null,
      };

      const completionEntry: CompletionLogEntry = {
        session_id: 'error-123',
        status: 'completed',
        outcome: 'error',
        ended_at: '2024-01-15T10:03:00Z',
        duration_seconds: 180,
        iterations: 1,
        error_reason: 'Something went wrong',
      };

      const result = mergeSessions([startEntry, completionEntry]);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('error');
      expect(result[0].error_reason).toBe('Something went wrong');
    });

    it('should sort active sessions first', () => {
      const entries: LogEntry[] = [
        {
          session_id: 'completed-1',
          status: 'active',
          project: '/test',
          project_name: 'test',
          state_file_path: '/test/.claude/state',
          task: 'Task 1',
          started_at: '2024-01-15T09:00:00Z',
          max_iterations: 5,
          completion_promise: null,
        } as StartLogEntry,
        {
          session_id: 'completed-1',
          status: 'completed',
          outcome: 'success',
          ended_at: '2024-01-15T09:30:00Z',
          duration_seconds: 1800,
          iterations: 5,
        } as CompletionLogEntry,
        {
          session_id: 'active-1',
          status: 'active',
          project: '/test2',
          project_name: 'test2',
          state_file_path: '/test2/.claude/state',
          task: 'Active task',
          started_at: '2024-01-15T08:00:00Z',
          max_iterations: 10,
          completion_promise: null,
        } as StartLogEntry,
      ];

      const result = mergeSessions(entries);

      expect(result).toHaveLength(2);
      expect(result[0].session_id).toBe('active-1');
      expect(result[0].status).toBe('active');
      expect(result[1].session_id).toBe('completed-1');
    });

    it('should sort completed sessions by date descending', () => {
      const entries: LogEntry[] = [
        {
          session_id: 'old-session',
          status: 'active',
          project: '/test',
          project_name: 'test',
          state_file_path: '/test/.claude/state',
          task: 'Old task',
          started_at: '2024-01-14T10:00:00Z',
          max_iterations: 5,
          completion_promise: null,
        } as StartLogEntry,
        {
          session_id: 'old-session',
          status: 'completed',
          outcome: 'success',
          ended_at: '2024-01-14T10:30:00Z',
          duration_seconds: 1800,
          iterations: 5,
        } as CompletionLogEntry,
        {
          session_id: 'new-session',
          status: 'active',
          project: '/test',
          project_name: 'test',
          state_file_path: '/test/.claude/state',
          task: 'New task',
          started_at: '2024-01-15T10:00:00Z',
          max_iterations: 5,
          completion_promise: null,
        } as StartLogEntry,
        {
          session_id: 'new-session',
          status: 'completed',
          outcome: 'success',
          ended_at: '2024-01-15T10:30:00Z',
          duration_seconds: 1800,
          iterations: 5,
        } as CompletionLogEntry,
      ];

      const result = mergeSessions(entries);

      expect(result).toHaveLength(2);
      expect(result[0].session_id).toBe('new-session');
      expect(result[1].session_id).toBe('old-session');
    });

    it('should skip entries without start record', () => {
      // This shouldn't happen in practice but good to test
      const completionOnly: CompletionLogEntry = {
        session_id: 'orphan-123',
        status: 'completed',
        outcome: 'success',
        ended_at: '2024-01-15T10:30:00Z',
        duration_seconds: 1800,
        iterations: 5,
      };

      const result = mergeSessions([completionOnly]);

      expect(result).toHaveLength(0);
    });
  });
});
