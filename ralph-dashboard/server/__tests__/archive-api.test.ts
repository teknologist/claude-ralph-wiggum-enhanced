import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleArchiveSession } from '../api/archive';
import * as logParser from '../services/log-parser';
import * as fs from 'fs';
import type { Session } from '../types';

vi.mock('../services/log-parser');
vi.mock('fs');

const createMockSession = (overrides: Partial<Session> = {}): Session => ({
  loop_id: 'test-loop-1',
  session_id: 'test-session-1',
  status: 'orphaned',
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
  has_checklist: false,
  checklist_progress: null,
  ...overrides,
});

describe('handleArchiveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(logParser.getLogFilePath).mockReturnValue('/path/to/log.jsonl');
  });

  it('archives orphaned session successfully', async () => {
    const mockSession = createMockSession({
      loop_id: 'loop-123',
      session_id: 'session-123',
      status: 'orphaned',
      iterations: 5,
    });
    vi.mocked(logParser.getSessionById).mockImplementation((id) => {
      if (id === 'loop-123') return mockSession;
      return null;
    });

    const response = handleArchiveSession('loop-123');
    const data = await response.json();

    expect(data).toEqual({
      success: true,
      message: 'Successfully archived orphaned loop loop-123',
      loop_id: 'loop-123',
    });
    expect(logParser.getSessionById).toHaveBeenCalledWith('loop-123');
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      '/path/to/log.jsonl',
      expect.stringContaining('"outcome":"orphaned"')
    );
  });

  it('returns 404 when session not found', async () => {
    vi.mocked(logParser.getSessionById).mockReturnValue(null);

    const response = handleArchiveSession('non-existent');
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('NOT_FOUND');
    expect(data.message).toContain('non-existent');
  });

  it('returns 400 when session is active (not orphaned)', async () => {
    const mockSession = createMockSession({
      session_id: 'session-123',
      status: 'active',
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);

    const response = handleArchiveSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_STATE');
    expect(data.message).toContain("status is 'active'");
    expect(data.message).toContain("expected 'orphaned'");
  });

  it('returns 400 when session is success (not orphaned)', async () => {
    const mockSession = createMockSession({
      session_id: 'session-123',
      status: 'success',
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);

    const response = handleArchiveSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_STATE');
    expect(data.message).toContain("status is 'success'");
  });

  it('returns 400 when session is cancelled (not orphaned)', async () => {
    const mockSession = createMockSession({
      session_id: 'session-123',
      status: 'cancelled',
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);

    const response = handleArchiveSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_STATE');
    expect(data.message).toContain("status is 'cancelled'");
  });

  it('handles session with null iterations', async () => {
    const mockSession = createMockSession({
      loop_id: 'loop-null-iter',
      session_id: 'session-null-iter',
      status: 'orphaned',
      iterations: null,
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);

    const response = handleArchiveSession('loop-null-iter');
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      '/path/to/log.jsonl',
      expect.stringContaining('"iterations":null')
    );
  });

  it('handles error thrown by getSessionById', async () => {
    vi.mocked(logParser.getSessionById).mockImplementation(() => {
      throw new Error('Database error');
    });

    const response = handleArchiveSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('ARCHIVE_ERROR');
    expect(data.message).toContain('Database error');
  });

  it('handles error thrown by appendFileSync', async () => {
    const mockSession = createMockSession({
      status: 'orphaned',
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);
    vi.mocked(fs.appendFileSync).mockImplementation(() => {
      throw new Error('File system error');
    });

    const response = handleArchiveSession('test-loop-1');
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('ARCHIVE_ERROR');
    expect(data.message).toContain('File system error');
  });

  it('handles non-Error thrown object', async () => {
    vi.mocked(logParser.getSessionById).mockImplementation(() => {
      throw 'string error';
    });

    const response = handleArchiveSession('session-123');
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('ARCHIVE_ERROR');
    expect(data.message).toContain('string error');
  });

  it('writes completion entry with correct format', async () => {
    const startedAt = '2024-01-15T10:00:00Z';
    const mockSession = createMockSession({
      loop_id: 'loop-format-test',
      session_id: 'session-format-test',
      status: 'orphaned',
      started_at: startedAt,
      iterations: 10,
    });
    vi.mocked(logParser.getSessionById).mockReturnValue(mockSession);

    handleArchiveSession('loop-format-test');

    // Verify that appendFileSync was called
    expect(fs.appendFileSync).toHaveBeenCalled();

    // Get the written data
    const call = vi.mocked(fs.appendFileSync).mock.calls[0];
    const writtenData = call[1] as string;
    const parsed = JSON.parse(writtenData.trim());

    expect(parsed.loop_id).toBe('loop-format-test');
    expect(parsed.session_id).toBe('session-format-test');
    expect(parsed.status).toBe('completed');
    expect(parsed.outcome).toBe('orphaned');
    expect(parsed.iterations).toBe(10);
    expect(parsed.ended_at).toBeDefined();
    expect(parsed.duration_seconds).toBeGreaterThanOrEqual(0);
  });
});
