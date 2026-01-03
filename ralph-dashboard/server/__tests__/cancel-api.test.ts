import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCancelSession } from '../api/cancel';
import * as logParser from '../services/log-parser';
import * as loopManager from '../services/loop-manager';
import type { Session } from '../types';

vi.mock('../services/log-parser');
vi.mock('../services/loop-manager');

const createMockSession = (overrides: Partial<Session> = {}): Session => ({
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
  ...overrides,
});

describe('handleCancelSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels active session successfully', async () => {
    const mockSession = createMockSession({
      session_id: 'session-123',
      status: 'active',
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);
    vi.mocked(loopManager.cancelLoop).mockReturnValue({
      success: true,
      message: 'Loop cancelled successfully',
    });

    const response = handleCancelSession('session-123');
    const data = await response.json();

    expect(data).toEqual({
      success: true,
      message: 'Loop cancelled successfully',
      session_id: 'session-123',
    });
    expect(loopManager.cancelLoop).toHaveBeenCalledWith(mockSession);
  });

  it('returns 404 when session not found', async () => {
    vi.mocked(logParser.getSessionById).mockReturnValue(null);

    const response = handleCancelSession('non-existent');
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('NOT_FOUND');
    expect(data.message).toContain('non-existent');
  });

  it('returns 400 when session is not active', async () => {
    const mockSession = createMockSession({
      session_id: 'session-123',
      status: 'success',
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);

    const response = handleCancelSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_STATE');
    expect(data.message).toContain("status is 'success'");
  });

  it('returns 400 when session is cancelled', async () => {
    const mockSession = createMockSession({
      session_id: 'session-123',
      status: 'cancelled',
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);

    const response = handleCancelSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_STATE');
    expect(data.message).toContain("status is 'cancelled'");
  });

  it('returns 400 when session has error status', async () => {
    const mockSession = createMockSession({
      session_id: 'session-123',
      status: 'error',
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);

    const response = handleCancelSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_STATE');
    expect(data.message).toContain("status is 'error'");
  });

  it('returns 400 when session reached max_iterations', async () => {
    const mockSession = createMockSession({
      session_id: 'session-123',
      status: 'max_iterations',
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);

    const response = handleCancelSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_STATE');
    expect(data.message).toContain("status is 'max_iterations'");
  });

  it('returns 500 when cancelLoop fails', async () => {
    const mockSession = createMockSession({
      session_id: 'session-123',
      status: 'active',
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);
    vi.mocked(loopManager.cancelLoop).mockReturnValue({
      success: false,
      message: 'State file not found',
    });

    const response = handleCancelSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('CANCEL_FAILED');
    expect(data.message).toBe('State file not found');
  });

  it('handles error thrown by getSessionById', async () => {
    vi.mocked(logParser.getSessionById).mockImplementation(() => {
      throw new Error('Database error');
    });

    const response = handleCancelSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('CANCEL_ERROR');
    expect(data.message).toContain('Database error');
  });

  it('handles error thrown by cancelLoop', async () => {
    const mockSession = createMockSession({
      session_id: 'session-123',
      status: 'active',
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);
    vi.mocked(loopManager.cancelLoop).mockImplementation(() => {
      throw new Error('File system error');
    });

    const response = handleCancelSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('CANCEL_ERROR');
    expect(data.message).toContain('File system error');
  });

  it('handles non-Error thrown object', async () => {
    vi.mocked(logParser.getSessionById).mockImplementation(() => {
      throw 'string error';
    });

    const response = handleCancelSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('CANCEL_ERROR');
    expect(data.message).toContain('string error');
  });
});
