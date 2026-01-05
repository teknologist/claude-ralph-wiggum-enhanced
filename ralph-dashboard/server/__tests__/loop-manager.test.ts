import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// We need to import after mocking
vi.mock('fs');
vi.mock('path');

const mockExistsSync = vi.mocked(fs.existsSync);
const mockUnlinkSync = vi.mocked(fs.unlinkSync);
const mockResolve = vi.mocked(path.resolve);

// Import the module after mocking
const { cancelLoop, checkStateFileExists } =
  await import('../services/loop-manager');

describe('loop-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mock behavior for resolve - return simple paths
    // First arg is usually the base path, subsequent args are joined
    mockResolve.mockImplementation((...args: string[]) => {
      // Simple implementation: join all non-empty args with /
      const filtered = args.filter(
        (a) => a !== undefined && a !== null && a !== ''
      );
      if (filtered.length === 0) return '/';
      if (filtered.length === 1) return filtered[0];
      return filtered.join('/');
    });
  });

  describe('cancelLoop', () => {
    const activeSession: Session = {
      loop_id: 'loop-test-123',
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
      has_checklist: false,
      checklist_progress: null,
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
      expect(result.message).toContain('No state file found');
    });

    it('should fail when state file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const result = cancelLoop(activeSession);

      expect(result.success).toBe(false);
      expect(result.message).toContain('State file no longer exists');
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
      expect(result.message).toContain('Failed to cancel loop');
    });

    it('should fail when state file path validation fails (no project)', () => {
      const sessionNoProject: Session = {
        ...activeSession,
        project: undefined as unknown as string,
      };

      const result = cancelLoop(sessionNoProject);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid state file path');
    });

    it('should fail when state file path is outside project directory', () => {
      const sessionBadPath: Session = {
        ...activeSession,
        state_file_path: '/etc/passwd', // Outside project directory
      };

      mockExistsSync.mockReturnValue(true);

      const result = cancelLoop(sessionBadPath);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid state file path');
    });

    it('should fail when resolve throws an error', () => {
      // Mock resolve to throw an error (simulates invalid path)
      mockResolve.mockImplementation(() => {
        throw new Error('Invalid path');
      });

      mockExistsSync.mockReturnValue(true);

      const result = cancelLoop(activeSession);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid state file path');
    });
  });

  describe('checkStateFileExists', () => {
    it('should return false when no state file path', () => {
      const session: Session = {
        loop_id: 'loop-test',
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
        has_checklist: false,
        checklist_progress: null,
      };

      const result = checkStateFileExists(session);
      expect(result).toBe(false);
    });

    it('should return true when state file exists', () => {
      mockExistsSync.mockReturnValue(true);

      const session: Session = {
        loop_id: 'loop-test',
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
        has_checklist: false,
        checklist_progress: null,
      };

      const result = checkStateFileExists(session);
      expect(result).toBe(true);
      expect(mockExistsSync).toHaveBeenCalledWith('/test/.claude/state.md');
    });

    it('should return false when state file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const session: Session = {
        loop_id: 'loop-test',
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
        has_checklist: false,
        checklist_progress: null,
      };

      const result = checkStateFileExists(session);
      expect(result).toBe(false);
    });
  });
});
