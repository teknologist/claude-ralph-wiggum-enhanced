import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exportTranscriptAsMarkdown,
  downloadMarkdown,
  generateExportFilename,
} from '../utils/exportTranscript';
import type { Session, IterationEntry } from '../../server/types';

const createMockSession = (overrides: Partial<Session> = {}): Session => ({
  loop_id: 'test-loop-123',
  session_id: 'test-session-456',
  status: 'success',
  project: '/path/to/project',
  project_name: 'Test Project',
  state_file_path: '/path/to/state-file.md',
  task: 'Build a REST API with authentication',
  started_at: '2024-01-15T10:00:00.000Z',
  ended_at: '2024-01-15T11:00:00.000Z',
  duration_seconds: 3600,
  iterations: 3,
  max_iterations: 10,
  completion_promise: 'TASK COMPLETE',
  error_reason: null,
  has_checklist: false,
  checklist_progress: null,
  ...overrides,
});

const createMockIterations = (): IterationEntry[] => [
  {
    iteration: 1,
    timestamp: '2024-01-15T10:00:00Z',
    output: 'Created basic server structure',
  },
  {
    iteration: 2,
    timestamp: '2024-01-15T10:20:00Z',
    output: 'Added authentication middleware',
  },
  {
    iteration: 3,
    timestamp: '2024-01-15T10:50:00Z',
    output: 'Completed all features',
  },
];

describe('exportTranscriptAsMarkdown', () => {
  it('generates markdown with session metadata', () => {
    const session = createMockSession();
    const iterations = createMockIterations();

    const markdown = exportTranscriptAsMarkdown(session, iterations);

    expect(markdown).toContain('# Ralph Loop Transcript');
    expect(markdown).toContain('**Project:** Test Project');
    expect(markdown).toContain('**Loop ID:** `test-loop-123`');
    expect(markdown).toContain('**Session ID:** `test-session-456`');
  });

  it('includes user prompt', () => {
    const session = createMockSession({
      task: 'My specific task description',
    });
    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('## User Prompt');
    expect(markdown).toContain('My specific task description');
  });

  it('includes iterations with outputs', () => {
    const session = createMockSession();
    const iterations = createMockIterations();

    const markdown = exportTranscriptAsMarkdown(session, iterations);

    expect(markdown).toContain('## Iterations');
    expect(markdown).toContain('### Iteration 1');
    expect(markdown).toContain('Created basic server structure');
    expect(markdown).toContain('### Iteration 2');
    expect(markdown).toContain('Added authentication middleware');
  });

  it('includes completion status for success', () => {
    const session = createMockSession({
      status: 'success',
      completion_promise: 'DONE',
    });

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('## Result');
    expect(markdown).toContain('✅ **Completed Successfully**');
    expect(markdown).toContain('`<promise>DONE</promise>`');
  });

  it('includes status for max_iterations', () => {
    const session = createMockSession({ status: 'max_iterations' });

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('🔁 **Max Iterations Reached**');
  });

  it('includes status for cancelled', () => {
    const session = createMockSession({ status: 'cancelled' });

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('⏹ **Cancelled**');
  });

  it('includes status for error with reason', () => {
    const session = createMockSession({
      status: 'error',
      error_reason: 'Something went wrong',
    });

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('❌ **Error**');
    expect(markdown).toContain('**Error:** Something went wrong');
  });

  it('includes status for orphaned', () => {
    const session = createMockSession({ status: 'orphaned' });

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('👻 **Orphaned**');
  });

  it('includes status for active', () => {
    const session = createMockSession({ status: 'active' });

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('⏳ **In Progress**');
  });

  it('formats duration correctly for seconds', () => {
    const session = createMockSession({ duration_seconds: 45 });

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('**Duration:** 45s');
  });

  it('formats duration correctly for minutes', () => {
    const session = createMockSession({ duration_seconds: 185 });

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('**Duration:** 3m 5s');
  });

  it('formats duration correctly for hours', () => {
    const session = createMockSession({ duration_seconds: 3660 });

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('**Duration:** 1h 1m');
  });

  it('shows N/A for undefined duration', () => {
    const session = createMockSession({
      duration_seconds: undefined as unknown as number,
    });

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('**Duration:** N/A');
  });

  it('includes export timestamp', () => {
    const session = createMockSession();

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('*Exported from Ralph Wiggum Pro Dashboard');
  });

  it('handles empty task description', () => {
    const session = createMockSession({ task: '' });

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).toContain('No task description');
  });

  it('handles null completion promise', () => {
    const session = createMockSession({
      status: 'success',
      completion_promise: null,
    });

    const markdown = exportTranscriptAsMarkdown(session, []);

    expect(markdown).not.toContain('Promise fulfilled');
  });
});

describe('generateExportFilename', () => {
  it('generates filename from project name and loop ID', () => {
    const session = createMockSession({
      project_name: 'My Project',
      loop_id: 'abc123def456',
    });

    const filename = generateExportFilename(session);

    expect(filename).toBe('my-project-abc123de.md');
  });

  it('sanitizes special characters in project name', () => {
    const session = createMockSession({
      project_name: 'My!@#$%Project',
      loop_id: 'loop12345678',
    });

    const filename = generateExportFilename(session);

    expect(filename).toBe('my-----project-loop1234.md');
  });

  it('handles short loop ID', () => {
    const session = createMockSession({
      project_name: 'Test',
      loop_id: 'abc',
    });

    const filename = generateExportFilename(session);

    expect(filename).toBe('test-abc.md');
  });
});

describe('downloadMarkdown', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('creates and triggers download', () => {
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
    };

    vi.spyOn(document, 'createElement').mockReturnValue(
      mockLink as unknown as HTMLAnchorElement
    );
    vi.spyOn(document.body, 'appendChild').mockImplementation(
      () => mockLink as unknown as HTMLAnchorElement
    );
    vi.spyOn(document.body, 'removeChild').mockImplementation(
      () => mockLink as unknown as HTMLAnchorElement
    );

    downloadMarkdown('# Test Content', 'test-file.md');

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(mockLink.href).toBe('blob:test-url');
    expect(mockLink.download).toBe('test-file.md');
    expect(mockLink.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });
});
