import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleDeleteSession } from '../api/delete';
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
    };

    vi.spyOn(logParser, 'getSessionById').mockReturnValue(activeSession);

    const response = handleDeleteSession('active-123');

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('INVALID_STATE');
    expect(data.message).toContain('Cannot delete active session');
  });

  it('returns 500 when deleteSession fails', async () => {
    const completedSession: Session = {
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
    };

    vi.spyOn(logParser, 'getSessionById').mockReturnValue(completedSession);
    vi.spyOn(logParser, 'deleteSession').mockReturnValue(true);

    const response = handleDeleteSession('completed-123');

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('permanently deleted');
    expect(data.session_id).toBe('completed-123');
  });

  it('allows deletion of cancelled sessions', async () => {
    const cancelledSession: Session = {
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
});
