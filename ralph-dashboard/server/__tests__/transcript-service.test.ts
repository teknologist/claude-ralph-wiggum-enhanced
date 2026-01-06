import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// Mock the fs module
vi.mock('fs');

// Import after mocking
import {
  getIterationsFilePath,
  getFullTranscriptFilePath,
  hasIterations,
  hasFullTranscript,
  getIterations,
  getFullTranscript,
  getRawFullTranscript,
} from '../services/transcript-service';

describe('transcript-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getIterationsFilePath', () => {
    it('returns correct path for loop ID when file exists in new directory', () => {
      // Mock directory exists and contains matching file
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // readdirSync returns filenames as strings
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session123-loop-123-iterations.jsonl',
        'other-file.txt',
      ] as unknown as ReturnType<typeof fs.readdirSync>);

      const result = getIterationsFilePath('loop-123');
      expect(result).toContain('session123-loop-123-iterations.jsonl');
    });

    it('returns correct path for old naming format', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'loop-123-iterations.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);

      const result = getIterationsFilePath('loop-123');
      expect(result).toContain('loop-123-iterations.jsonl');
    });

    it('falls back to old directory when file not in new directory', () => {
      let callCount = 0;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        callCount++;
        // First call (new dir) returns empty, second call (old dir) returns file
        if (callCount === 1)
          return [] as unknown as ReturnType<typeof fs.readdirSync>;
        return ['loop-123-iterations.jsonl'] as unknown as ReturnType<
          typeof fs.readdirSync
        >;
      });

      const result = getIterationsFilePath('loop-123');
      expect(result).toContain('loop-123-iterations.jsonl');
    });

    it('returns null when file not found in either directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(
        [] as unknown as ReturnType<typeof fs.readdirSync>
      );

      const result = getIterationsFilePath('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getFullTranscriptFilePath', () => {
    it('returns correct path for loop ID', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session123-loop-456-full.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);

      const result = getFullTranscriptFilePath('loop-456');
      expect(result).toContain('session123-loop-456-full.jsonl');
    });
  });

  describe('hasIterations', () => {
    it('returns true when file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-iterations.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      expect(hasIterations('loop-123')).toBe(true);
    });

    it('returns false when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(hasIterations('loop-123')).toBe(false);
    });
  });

  describe('hasFullTranscript', () => {
    it('returns true when file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-full.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      expect(hasFullTranscript('loop-123')).toBe(true);
    });

    it('returns false when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(hasFullTranscript('loop-123')).toBe(false);
    });
  });

  describe('getIterations', () => {
    it('returns null when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(getIterations('loop-123')).toBeNull();
    });

    it('returns parsed iterations when file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-iterations.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      const jsonlContent = [
        '{"iteration": 1, "timestamp": "2024-01-15T10:00:00Z", "output": "First output"}',
        '{"iteration": 2, "timestamp": "2024-01-15T10:30:00Z", "output": "Second output"}',
      ].join('\n');
      vi.mocked(fs.readFileSync).mockReturnValue(jsonlContent);

      const result = getIterations('loop-123');

      expect(result).toHaveLength(2);
      expect(result![0]).toEqual({
        iteration: 1,
        timestamp: '2024-01-15T10:00:00Z',
        output: 'First output',
      });
      expect(result![1]).toEqual({
        iteration: 2,
        timestamp: '2024-01-15T10:30:00Z',
        output: 'Second output',
      });
    });

    it('skips malformed lines', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-iterations.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      const jsonlContent = [
        '{"iteration": 1, "timestamp": "2024-01-15T10:00:00Z", "output": "First output"}',
        'not valid json',
        '{"iteration": 2, "timestamp": "2024-01-15T10:30:00Z", "output": "Second output"}',
      ].join('\n');
      vi.mocked(fs.readFileSync).mockReturnValue(jsonlContent);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = getIterations('loop-123');

      expect(result).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledWith(
        'Skipping malformed iteration entry:',
        expect.any(String)
      );
      warnSpy.mockRestore();
    });

    it('returns null on read error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-iterations.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(getIterations('loop-123')).toBeNull();
      errorSpy.mockRestore();
    });

    it('handles empty lines', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-iterations.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      const jsonlContent = [
        '{"iteration": 1, "timestamp": "2024-01-15T10:00:00Z", "output": "First output"}',
        '',
        '   ',
        '{"iteration": 2, "timestamp": "2024-01-15T10:30:00Z", "output": "Second output"}',
      ].join('\n');
      vi.mocked(fs.readFileSync).mockReturnValue(jsonlContent);

      const result = getIterations('loop-123');
      expect(result).toHaveLength(2);
    });
  });

  describe('getFullTranscript', () => {
    it('returns null when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(getFullTranscript('loop-123')).toBeNull();
    });

    it('returns parsed messages when file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-full.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      const jsonlContent = [
        '{"message": {"role": "user", "content": [{"type": "text", "text": "Hello"}]}}',
        '{"message": {"role": "assistant", "content": [{"type": "text", "text": "Hi there!"}]}}',
      ].join('\n');
      vi.mocked(fs.readFileSync).mockReturnValue(jsonlContent);

      const result = getFullTranscript('loop-123');

      expect(result).toHaveLength(2);
      expect(result![0]).toEqual({ role: 'user', content: 'Hello' });
      expect(result![1]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('joins multiple text content blocks', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-full.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      const jsonlContent =
        '{"message": {"role": "assistant", "content": [{"type": "text", "text": "First part"}, {"type": "text", "text": "Second part"}]}}';
      vi.mocked(fs.readFileSync).mockReturnValue(jsonlContent);

      const result = getFullTranscript('loop-123');

      expect(result).toHaveLength(1);
      expect(result![0].content).toBe('First part\nSecond part');
    });

    it('filters out non-text content', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-full.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      const jsonlContent =
        '{"message": {"role": "assistant", "content": [{"type": "tool_use", "name": "test"}, {"type": "text", "text": "Result"}]}}';
      vi.mocked(fs.readFileSync).mockReturnValue(jsonlContent);

      const result = getFullTranscript('loop-123');

      expect(result).toHaveLength(1);
      expect(result![0].content).toBe('Result');
    });

    it('skips entries without text content', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-full.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      const jsonlContent = [
        '{"message": {"role": "assistant", "content": [{"type": "tool_use", "name": "test"}]}}',
        '{"message": {"role": "user", "content": [{"type": "text", "text": "Hello"}]}}',
      ].join('\n');
      vi.mocked(fs.readFileSync).mockReturnValue(jsonlContent);

      const result = getFullTranscript('loop-123');

      expect(result).toHaveLength(1);
      expect(result![0]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('skips entries without message or content', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-full.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      const jsonlContent = [
        '{"other": "data"}',
        '{"message": {}}',
        '{"message": {"role": "user"}}',
        '{"message": {"role": "user", "content": [{"type": "text", "text": "Hello"}]}}',
      ].join('\n');
      vi.mocked(fs.readFileSync).mockReturnValue(jsonlContent);

      const result = getFullTranscript('loop-123');

      expect(result).toHaveLength(1);
    });

    it('skips malformed JSON lines', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-full.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      const jsonlContent = [
        'not json',
        '{"message": {"role": "user", "content": [{"type": "text", "text": "Hello"}]}}',
      ].join('\n');
      vi.mocked(fs.readFileSync).mockReturnValue(jsonlContent);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = getFullTranscript('loop-123');

      expect(result).toHaveLength(1);
      warnSpy.mockRestore();
    });

    it('returns null on read error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-full.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(getFullTranscript('loop-123')).toBeNull();
      errorSpy.mockRestore();
    });
  });

  describe('getRawFullTranscript', () => {
    it('returns null when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(getRawFullTranscript('loop-123')).toBeNull();
    });

    it('returns raw content when file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-full.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      const rawContent = '{"line": 1}\n{"line": 2}';
      vi.mocked(fs.readFileSync).mockReturnValue(rawContent);

      expect(getRawFullTranscript('loop-123')).toBe(rawContent);
    });

    it('returns null on read error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'session-loop-123-full.jsonl',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(getRawFullTranscript('loop-123')).toBeNull();
      errorSpy.mockRestore();
    });
  });
});
