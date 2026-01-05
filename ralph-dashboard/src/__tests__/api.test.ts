import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchSessions,
  fetchSession,
  cancelSession,
  deleteSession,
  archiveSession,
} from '../lib/api';
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
        loop_id: 'test-123',
        session_id: 'test-session-123',
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
        has_checklist: false,
        checklist_progress: null,
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

  describe('deleteSession', () => {
    it('should delete session successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Session permanently deleted from history',
        session_id: 'test-123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await deleteSession('test-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/sessions/test-123', {
        method: 'DELETE',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw error when trying to delete active session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: 'INVALID_STATE',
            message: 'Cannot delete active session',
          }),
      });

      await expect(deleteSession('test-123')).rejects.toThrow(
        'Cannot delete active session'
      );
    });

    it('should throw error when session not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: 'NOT_FOUND',
            message: 'Session not found',
          }),
      });

      await expect(deleteSession('nonexistent')).rejects.toThrow(
        'Session not found'
      );
    });
  });

  describe('archiveSession', () => {
    it('should archive orphaned session successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Successfully archived orphaned loop test-123',
        loop_id: 'test-123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await archiveSession('test-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/sessions/test-123/archive', {
        method: 'POST',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw error when trying to archive non-orphaned session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: 'INVALID_STATE',
            message:
              "Cannot archive loop: status is 'active', expected 'orphaned'",
          }),
      });

      await expect(archiveSession('test-123')).rejects.toThrow(
        "Cannot archive loop: status is 'active', expected 'orphaned'"
      );
    });

    it('should throw error when session not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: 'NOT_FOUND',
            message: 'Loop not found: nonexistent',
          }),
      });

      await expect(archiveSession('nonexistent')).rejects.toThrow(
        'Loop not found: nonexistent'
      );
    });
  });
});
