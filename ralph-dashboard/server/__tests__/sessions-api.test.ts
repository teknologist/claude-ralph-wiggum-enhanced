import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetSessions, handleGetSession } from '../api/sessions';
import * as logParser from '../services/log-parser';
import type { Session } from '../types';

vi.mock('../services/log-parser');

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

describe('handleGetSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sessions with correct response format', async () => {
    const mockSessions = [
      createMockSession({ session_id: '1', status: 'active' }),
      createMockSession({ session_id: '2', status: 'success' }),
    ];
    vi.mocked(logParser.getSessions).mockReturnValue(mockSessions);

    const response = handleGetSessions();
    const data = await response.json();

    expect(data).toEqual({
      sessions: mockSessions,
      total: 2,
      active_count: 1,
    });
  });

  it('calculates active_count correctly', async () => {
    const mockSessions = [
      createMockSession({ session_id: '1', status: 'active' }),
      createMockSession({ session_id: '2', status: 'active' }),
      createMockSession({ session_id: '3', status: 'success' }),
      createMockSession({ session_id: '4', status: 'cancelled' }),
    ];
    vi.mocked(logParser.getSessions).mockReturnValue(mockSessions);

    const response = handleGetSessions();
    const data = await response.json();

    expect(data.active_count).toBe(2);
    expect(data.total).toBe(4);
  });

  it('returns empty array when no sessions', async () => {
    vi.mocked(logParser.getSessions).mockReturnValue([]);

    const response = handleGetSessions();
    const data = await response.json();

    expect(data).toEqual({
      sessions: [],
      total: 0,
      active_count: 0,
    });
  });

  it('handles error from getSessions', async () => {
    vi.mocked(logParser.getSessions).mockImplementation(() => {
      throw new Error('File read error');
    });

    const response = handleGetSessions();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('FETCH_ERROR');
    expect(data.message).toContain('File read error');
  });

  it('handles non-Error thrown object', async () => {
    vi.mocked(logParser.getSessions).mockImplementation(() => {
      throw 'string error';
    });

    const response = handleGetSessions();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('FETCH_ERROR');
    expect(data.message).toContain('string error');
  });
});

describe('handleGetSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns session when found', async () => {
    const mockSession = createMockSession({ session_id: 'session-123' });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);

    const response = handleGetSession('session-123');
    const data = await response.json();

    expect(data).toEqual(mockSession);
    expect(logParser.getSessionById).toHaveBeenCalledWith('session-123');
  });

  it('returns 404 when session not found', async () => {
    vi.mocked(logParser.getSessionById).mockReturnValue(null);

    const response = handleGetSession('non-existent');
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('NOT_FOUND');
    expect(data.message).toContain('non-existent');
  });

  it('handles error from getSessionById', async () => {
    vi.mocked(logParser.getSessionById).mockImplementation(() => {
      throw new Error('Database error');
    });

    const response = handleGetSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('FETCH_ERROR');
    expect(data.message).toContain('Database error');
  });

  it('handles non-Error thrown object', async () => {
    vi.mocked(logParser.getSessionById).mockImplementation(() => {
      throw { code: 'CUSTOM_ERROR' };
    });

    const response = handleGetSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('FETCH_ERROR');
  });
});
