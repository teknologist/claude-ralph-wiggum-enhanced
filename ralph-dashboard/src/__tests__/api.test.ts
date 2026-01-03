import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSessions, fetchSession, cancelSession } from '../lib/api';
import type { SessionsResponse, Session } from '../../server/types';

describe('API client', () => {
  const mockFetch = vi.fn();
  global.fetch = mockFetch as unknown as typeof fetch;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('fetchSessions', () => {
    it('should fetch sessions successfully', async () => {
      const mockResponse: SessionsResponse = {
        sessions: [],
        total: 0,
        active_count: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await fetchSessions();

      expect(mockFetch).toHaveBeenCalledWith('/api/sessions');
      expect(result).toEqual(mockResponse);
    });

    it('should throw error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({ error: 'FETCH_ERROR', message: 'Failed to fetch' }),
      });

      await expect(fetchSessions()).rejects.toThrow('Failed to fetch');
    });
  });

  describe('fetchSession', () => {
    it('should fetch single session successfully', async () => {
      const mockSession: Session = {
        session_id: 'test-123',
        status: 'active',
        project: '/test',
        project_name: 'test',
        state_file_path: '/test/.claude/state.md',
        task: 'Test task',
        started_at: '2024-01-15T10:00:00Z',
        ended_at: null,
        duration_seconds: 600,
        iterations: null,
        max_iterations: 10,
        completion_promise: null,
        error_reason: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSession),
      });

      const result = await fetchSession('test-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/sessions/test-123');
      expect(result).toEqual(mockSession);
    });

    it('should throw error when session not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({ error: 'NOT_FOUND', message: 'Session not found' }),
      });

      await expect(fetchSession('nonexistent')).rejects.toThrow(
        'Session not found'
      );
    });
  });

  describe('cancelSession', () => {
    it('should cancel session successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Successfully cancelled',
        session_id: 'test-123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await cancelSession('test-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/sessions/test-123/cancel', {
        method: 'POST',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw error on cancel failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: 'INVALID_STATE',
            message: 'Cannot cancel: not active',
          }),
      });

      await expect(cancelSession('test-123')).rejects.toThrow(
        'Cannot cancel: not active'
      );
    });
  });
});
