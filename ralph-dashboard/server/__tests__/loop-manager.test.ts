import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '../types';
import * as fs from 'fs';

// We need to import after mocking
vi.mock('fs');

const mockExistsSync = vi.mocked(fs.existsSync);
const mockUnlinkSync = vi.mocked(fs.unlinkSync);

// Import the module after mocking
const { cancelLoop, checkStateFileExists } =
  await import('../services/loop-manager');

describe('loop-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cancelLoop', () => {
    const activeSession: Session = {
      session_id: 'test-123',
      status: 'active',
      project: '/Users/test/project',
      project_name: 'project',
      state_file_path:
        '/Users/test/project/.claude/ralph-loop.test-123.local.md',
      task: 'Test task',
      started_at: '2024-01-15T10:00:00Z',
      ended_at: null,
      duration_seconds: 600,
      iterations: null,
      max_iterations: 10,
      completion_promise: 'Complete test',
      error_reason: null,
    };

    it('should fail for non-active session', () => {
      const completedSession: Session = {
        ...activeSession,
        status: 'success',
        ended_at: '2024-01-15T10:30:00Z',
      };

      const result = cancelLoop(completedSession);

      expect(result.success).toBe(false);
      expect(result.message).toContain('not active');
    });

    it('should fail when no state file path', () => {
      const sessionNoPath: Session = {
        ...activeSession,
        state_file_path: undefined as unknown as string,
      };

      const result = cancelLoop(sessionNoPath);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No state file path');
    });

    it('should fail when state file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const result = cancelLoop(activeSession);

      expect(result.success).toBe(false);
      expect(result.message).toContain('State file not found');
    });

    it('should successfully delete state file', () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockImplementation(() => undefined);

      const result = cancelLoop(activeSession);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully cancelled');
      expect(mockUnlinkSync).toHaveBeenCalledWith(
        activeSession.state_file_path
      );
    });

    it('should handle deletion errors', () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = cancelLoop(activeSession);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Permission denied');
    });
  });

  describe('checkStateFileExists', () => {
    it('should return false when no state file path', () => {
      const session: Session = {
        session_id: 'test',
        status: 'active',
        project: '/test',
        project_name: 'test',
        state_file_path: undefined as unknown as string,
        task: 'Test',
        started_at: '2024-01-15T10:00:00Z',
        ended_at: null,
        duration_seconds: 0,
        iterations: null,
        max_iterations: 5,
        completion_promise: null,
        error_reason: null,
      };

      const result = checkStateFileExists(session);
      expect(result).toBe(false);
    });

    it('should return true when state file exists', () => {
      mockExistsSync.mockReturnValue(true);

      const session: Session = {
        session_id: 'test',
        status: 'active',
        project: '/test',
        project_name: 'test',
        state_file_path: '/test/.claude/state.md',
        task: 'Test',
        started_at: '2024-01-15T10:00:00Z',
        ended_at: null,
        duration_seconds: 0,
        iterations: null,
        max_iterations: 5,
        completion_promise: null,
        error_reason: null,
      };

      const result = checkStateFileExists(session);
      expect(result).toBe(true);
      expect(mockExistsSync).toHaveBeenCalledWith('/test/.claude/state.md');
    });

    it('should return false when state file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const session: Session = {
        session_id: 'test',
        status: 'active',
        project: '/test',
        project_name: 'test',
        state_file_path: '/test/.claude/state.md',
        task: 'Test',
        started_at: '2024-01-15T10:00:00Z',
        ended_at: null,
        duration_seconds: 0,
        iterations: null,
        max_iterations: 5,
        completion_promise: null,
        error_reason: null,
      };

      const result = checkStateFileExists(session);
      expect(result).toBe(false);
    });
  });
});
