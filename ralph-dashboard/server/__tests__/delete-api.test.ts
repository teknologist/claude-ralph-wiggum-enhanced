import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleDeleteSession,
  handleDeleteAllArchivedSessions,
} from '../api/delete';
import * as logParser from '../services/log-parser';
import type { Session } from '../types';

describe('handleDeleteSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 404 when session is not found', async () => {
    vi.spyOn(logParser, 'getSessionById').mockReturnValue(null);

    const response = handleDeleteSession('non-existent-id');

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('NOT_FOUND');
  });

  it('returns 400 when trying to delete active session', async () => {
    const activeSession: Session = {
      loop_id: 'loop-active-123',
      session_id: 'active-123',
      status: 'active',
      project: '/test',
      project_name: 'test',
      state_file_path: '/test/.claude/state',
      task: 'Active task',
      started_at: '2024-01-15T10:00:00Z',
      ended_at: null,
      duration_seconds: 600,
      iterations: 5,
      max_iterations: 10,
      completion_promise: null,
      error_reason: null,
      has_checklist: false,
      checklist_progress: null,
    };

    vi.spyOn(logParser, 'getSessionById').mockReturnValue(activeSession);

    const response = handleDeleteSession('active-123');

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('INVALID_STATE');
    expect(data.message).toContain('Cannot delete active loop');
  });

  it('returns 500 when deleteSession fails', async () => {
    const completedSession: Session = {
      loop_id: 'loop-completed-123',
      session_id: 'completed-123',
      status: 'success',
      outcome: 'success',
      project: '/test',
      project_name: 'test',
      state_file_path: '/test/.claude/state',
      task: 'Completed task',
      started_at: '2024-01-15T10:00:00Z',
      ended_at: '2024-01-15T10:30:00Z',
      duration_seconds: 1800,
      iterations: 5,
      max_iterations: 10,
      completion_promise: null,
      error_reason: null,
      has_checklist: false,
      checklist_progress: null,
    };

    vi.spyOn(logParser, 'getSessionById').mockReturnValue(completedSession);
    vi.spyOn(logParser, 'deleteSession').mockReturnValue(false);

    const response = handleDeleteSession('completed-123');

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('DELETE_FAILED');
  });

  it('returns success when session is deleted', async () => {
    const completedSession: Session = {
      loop_id: 'loop-completed-123',
      session_id: 'completed-123',
      status: 'success',
      outcome: 'success',
      project: '/test',
      project_name: 'test',
      state_file_path: '/test/.claude/state',
      task: 'Completed task',
      started_at: '2024-01-15T10:00:00Z',
      ended_at: '2024-01-15T10:30:00Z',
      duration_seconds: 1800,
      iterations: 5,
      max_iterations: 10,
      completion_promise: null,
      error_reason: null,
      has_checklist: false,
      checklist_progress: null,
    };

    vi.spyOn(logParser, 'getSessionById').mockReturnValue(completedSession);
    vi.spyOn(logParser, 'deleteSession').mockReturnValue(true);

    const response = handleDeleteSession('completed-123');

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('permanently deleted');
    expect(data.loop_id).toBe('completed-123');
  });

  it('allows deletion of cancelled sessions', async () => {
    const cancelledSession: Session = {
      loop_id: 'loop-cancelled-123',
      session_id: 'cancelled-123',
      status: 'cancelled',
      outcome: 'cancelled',
      project: '/test',
      project_name: 'test',
      state_file_path: '/test/.claude/state',
      task: 'Cancelled task',
      started_at: '2024-01-15T10:00:00Z',
      ended_at: '2024-01-15T10:15:00Z',
      duration_seconds: 900,
      iterations: 3,
      max_iterations: 10,
      completion_promise: null,
      error_reason: null,
      has_checklist: false,
      checklist_progress: null,
    };

    vi.spyOn(logParser, 'getSessionById').mockReturnValue(cancelledSession);
    vi.spyOn(logParser, 'deleteSession').mockReturnValue(true);

    const response = handleDeleteSession('cancelled-123');

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('allows deletion of error sessions', async () => {
    const errorSession: Session = {
      loop_id: 'loop-error-123',
      session_id: 'error-123',
      status: 'error',
      outcome: 'error',
      project: '/test',
      project_name: 'test',
      state_file_path: '/test/.claude/state',
      task: 'Error task',
      started_at: '2024-01-15T10:00:00Z',
      ended_at: '2024-01-15T10:05:00Z',
      duration_seconds: 300,
      iterations: 1,
      max_iterations: 10,
      completion_promise: null,
      error_reason: 'Something failed',
      has_checklist: false,
      checklist_progress: null,
    };

    vi.spyOn(logParser, 'getSessionById').mockReturnValue(errorSession);
    vi.spyOn(logParser, 'deleteSession').mockReturnValue(true);

    const response = handleDeleteSession('error-123');

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('allows deletion of max_iterations sessions', async () => {
    const maxIterSession: Session = {
      loop_id: 'loop-maxiter-123',
      session_id: 'maxiter-123',
      status: 'max_iterations',
      outcome: 'max_iterations',
      project: '/test',
      project_name: 'test',
      state_file_path: '/test/.claude/state',
      task: 'Max iterations task',
      started_at: '2024-01-15T10:00:00Z',
      ended_at: '2024-01-15T10:30:00Z',
      duration_seconds: 1800,
      iterations: 10,
      max_iterations: 10,
      completion_promise: null,
      error_reason: null,
      has_checklist: false,
      checklist_progress: null,
    };

    vi.spyOn(logParser, 'getSessionById').mockReturnValue(maxIterSession);
    vi.spyOn(logParser, 'deleteSession').mockReturnValue(true);

    const response = handleDeleteSession('maxiter-123');

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('returns 500 when an exception is thrown', async () => {
    vi.spyOn(logParser, 'getSessionById').mockImplementation(() => {
      throw new Error('Database connection failed');
    });

    const response = handleDeleteSession('error-123');

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('DELETE_ERROR');
    expect(data.message).toContain('Database connection failed');
  });

  it('returns 500 when non-Error object is thrown', async () => {
    // Test with string (not an Error instance)
    vi.spyOn(logParser, 'getSessionById').mockImplementation(() => {
      throw 'String error message';
    });

    const response = handleDeleteSession('error-123');

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('DELETE_ERROR');
    expect(data.message).toContain('String error message');
  });
});

describe('handleDeleteAllArchivedSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success with deleted count', async () => {
    vi.spyOn(logParser, 'deleteAllArchivedSessions').mockReturnValue(5);

    const response = handleDeleteAllArchivedSessions();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.deleted_count).toBe(5);
    expect(data.message).toContain('5 archived session(s)');
  });

  it('returns zero when no archived sessions exist', async () => {
    vi.spyOn(logParser, 'deleteAllArchivedSessions').mockReturnValue(0);

    const response = handleDeleteAllArchivedSessions();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.deleted_count).toBe(0);
    expect(data.message).toContain('0 archived session(s)');
  });

  it('returns 500 when an Error is thrown', async () => {
    vi.spyOn(logParser, 'deleteAllArchivedSessions').mockImplementation(() => {
      throw new Error('Database connection failed');
    });

    const response = handleDeleteAllArchivedSessions();

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('DELETE_ERROR');
    expect(data.message).toContain('Failed to delete archived sessions');
    expect(data.message).toContain('Database connection failed');
  });

  it('returns 500 when non-Error object is thrown', async () => {
    vi.spyOn(logParser, 'deleteAllArchivedSessions').mockImplementation(() => {
      throw 'String error message';
    });

    const response = handleDeleteAllArchivedSessions();

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('DELETE_ERROR');
    expect(data.message).toContain('String error message');
  });
});
