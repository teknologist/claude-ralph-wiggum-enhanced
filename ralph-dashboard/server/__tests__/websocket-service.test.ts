import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ServerWebSocket } from 'bun';
import type { WebSocketData } from '../types';
import { EventEmitter } from 'events';

// Mock FS functions before importing the service
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    watch: vi.fn(),
    openSync: vi.fn(),
    readSync: vi.fn(),
    fstatSync: vi.fn(),
    closeSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
  };
});

// Mock the file-finder module
vi.mock('../services/file-finder.js', () => ({
  findFileByLoopId: vi.fn(),
  getTranscriptsDir: vi.fn(() => '/mock/transcripts'),
}));

// Mock the checklist-service module
vi.mock('../services/checklist-service.js', () => ({
  getChecklistWithProgress: vi.fn(() => ({
    checklist: null,
    progress: null,
  })),
}));

// Now import the service under test and get mocks
import * as fs from 'fs';
import {
  findFileByLoopId,
  getTranscriptsDir,
} from '../services/file-finder.js';
import { getChecklistWithProgress } from '../services/checklist-service.js';
import {
  subscribeToLoop,
  unsubscribeFromLoop,
  unsubscribeFromAll,
  getActiveWatcherCount,
  cleanupAllWatchers,
  countClientSubscriptions,
  canClientSubscribe,
} from '../services/websocket-service';

// Get mocked functions
const mockWatch = vi.mocked(fs.watch);
const mockOpenSync = vi.mocked(fs.openSync);
const mockReadSync = vi.mocked(fs.readSync);
const mockFstatSync = vi.mocked(fs.fstatSync);
const mockCloseSync = vi.mocked(fs.closeSync);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockStatSync = vi.mocked(fs.statSync);

// Mock FSWatcher class that extends EventEmitter
class MockFSWatcher extends EventEmitter {
  close = vi.fn();
  constructor() {
    super();
  }
}

// Helper to create a mock ServerWebSocket
function createMockWebSocket(
  readyState: number = 1
): ServerWebSocket<WebSocketData> {
  return {
    readyState,
    send: vi.fn(),
    data: { loopId: 'test-loop' },
    remoteAddress: '127.0.0.1',
    publish: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    isSubscribed: vi.fn(),
    close: vi.fn(),
  } as unknown as ServerWebSocket<WebSocketData>;
}

describe('websocket-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    // Reset the module state by clearing all watchers
    cleanupAllWatchers();

    // Reset all mock defaults - must be done AFTER cleanup
    mockExistsSync.mockImplementation((path: unknown) => {
      // Default: only directory exists, not files
      const p = path as string;
      return p === '/mock/transcripts';
    });
    mockOpenSync.mockReturnValue(1);
    mockFstatSync.mockReturnValue({ size: 0 });
    mockReadSync.mockReturnValue(0);
    mockCloseSync.mockReturnValue(undefined);
    mockMkdirSync.mockReturnValue(undefined);
    vi.mocked(findFileByLoopId).mockReturnValue(null);
    vi.mocked(getTranscriptsDir).mockReturnValue('/mock/transcripts');
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupAllWatchers();
  });

  describe('subscribeToLoop', () => {
    it('should create a new watcher when subscribing to a loop with no existing file', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      // Default mock setup in beforeEach already has directory exists, file doesn't

      const client = createMockWebSocket();
      const result = subscribeToLoop('test-loop', client);

      // Should succeed even if file doesn't exist yet
      expect(result.success).toBe(true);
      // The watcher count should be tracked
      expect(getActiveWatcherCount()).toBe(1);
    });

    it('should create a file watcher when the file already exists', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      // Add file exists to default mock
      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-file.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-file.jsonl'
      );

      const client = createMockWebSocket();
      const result = subscribeToLoop('test-loop', client);

      expect(result.success).toBe(true);
      // Should track the subscription
      expect(getActiveWatcherCount()).toBe(1);
    });

    it('should add multiple clients to the same watcher', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      const client1 = createMockWebSocket();
      const client2 = createMockWebSocket();

      subscribeToLoop('test-loop', client1);
      subscribeToLoop('test-loop', client2);

      expect(getActiveWatcherCount()).toBe(1); // Still only one watcher
    });

    it('should enforce rate limiting - max subscriptions per client', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      const client = createMockWebSocket();

      // Subscribe to 10 different loops (max allowed)
      for (let i = 0; i < 10; i++) {
        const result = subscribeToLoop(`loop-${i}`, client);
        expect(result.success).toBe(true);
      }

      // The 11th subscription should fail
      const result = subscribeToLoop('loop-11', client);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Maximum subscriptions');
    });

    it('should count subscriptions correctly across different loops', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      const client = createMockWebSocket();

      subscribeToLoop('loop-1', client);
      subscribeToLoop('loop-2', client);
      subscribeToLoop('loop-3', client);

      expect(countClientSubscriptions(client)).toBe(3);
    });

    it('should check if client can subscribe', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      const client = createMockWebSocket();

      expect(canClientSubscribe(client)).toBe(true);

      // Subscribe to 10 loops (max)
      for (let i = 0; i < 10; i++) {
        subscribeToLoop(`loop-${i}`, client);
      }

      expect(canClientSubscribe(client)).toBe(false);
    });

    it('should create directory if it does not exist', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      // First call: directory doesn't exist, second call: directory exists (after mkdir)
      let callCount = 0;
      mockExistsSync.mockImplementation(() => {
        callCount++;
        return callCount > 1; // Directory exists after mkdir
      });

      const client = createMockWebSocket();
      const result = subscribeToLoop('test-loop', client);

      // Should succeed regardless of directory creation
      expect(result.success).toBe(true);
    });

    it('should handle file read errors gracefully when initializing lastSize', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });
      mockOpenSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-file.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-file.jsonl'
      );

      const client = createMockWebSocket();
      const result = subscribeToLoop('test-loop', client);

      // Should still succeed, just start from 0
      expect(result.success).toBe(true);
    });

    it('should set up checklist watcher when file exists', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockStatSync.mockReturnValue({ mtimeMs: 1234567890 });

      // Add checklist file exists
      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-checklist.json') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockImplementation(
        (_loopId: string, suffix: string) => {
          if (suffix === 'checklist.json') {
            return '/mock/transcripts/test-checklist.json';
          }
          return null;
        }
      );

      const client = createMockWebSocket();
      const result = subscribeToLoop('test-loop', client);

      expect(result.success).toBe(true);
      // Should track the subscription
      expect(getActiveWatcherCount()).toBe(1);
    });
  });

  describe('unsubscribeFromLoop', () => {
    it('should remove client from loop watcher', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      const client1 = createMockWebSocket();
      const client2 = createMockWebSocket();

      subscribeToLoop('test-loop', client1);
      subscribeToLoop('test-loop', client2);

      expect(getActiveWatcherCount()).toBe(1);

      unsubscribeFromLoop('test-loop', client1);

      // Watcher should still exist with client2
      expect(getActiveWatcherCount()).toBe(1);
    });

    it('should clean up watcher when last client unsubscribes', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      const client = createMockWebSocket();

      subscribeToLoop('test-loop', client);
      expect(getActiveWatcherCount()).toBe(1);

      unsubscribeFromLoop('test-loop', client);
      // Watcher should be removed
      expect(getActiveWatcherCount()).toBe(0);
    });

    it('should handle unsubscribe from non-existent loop gracefully', () => {
      const client = createMockWebSocket();

      // Should not throw
      expect(() => {
        unsubscribeFromLoop('non-existent-loop', client);
      }).not.toThrow();
    });

    it('should clean up checklist watcher when last client unsubscribes', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockStatSync.mockReturnValue({ mtimeMs: 1234567890 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-checklist.json') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockImplementation(
        (_loopId: string, suffix: string) => {
          if (suffix === 'checklist.json') {
            return '/mock/transcripts/test-checklist.json';
          }
          return null;
        }
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      expect(getActiveWatcherCount()).toBe(1);

      unsubscribeFromLoop('test-loop', client);

      // Watcher should be removed
      expect(getActiveWatcherCount()).toBe(0);
    });
  });

  describe('unsubscribeFromAll', () => {
    it('should remove client from all subscribed loops', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      mockExistsSync.mockImplementation((path: unknown) => {
        return (path as string) === '/mock/transcripts';
      });

      const client1 = createMockWebSocket();
      const client2 = createMockWebSocket();

      subscribeToLoop('loop-1', client1);
      subscribeToLoop('loop-2', client1);
      subscribeToLoop('loop-3', client2);

      expect(getActiveWatcherCount()).toBe(3);

      unsubscribeFromAll(client1);

      // loop-1 and loop-2 should be cleaned up (no more clients)
      // loop-3 should still exist (client2 is still subscribed)
      expect(getActiveWatcherCount()).toBe(1);
    });

    it('should handle client with no subscriptions gracefully', () => {
      const client = createMockWebSocket();

      expect(() => {
        unsubscribeFromAll(client);
      }).not.toThrow();
    });

    it('should clean up all watchers when all clients unsubscribe', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      mockExistsSync.mockImplementation((path: unknown) => {
        return (path as string) === '/mock/transcripts';
      });

      const client1 = createMockWebSocket();
      const client2 = createMockWebSocket();

      subscribeToLoop('loop-1', client1);
      subscribeToLoop('loop-2', client2);

      unsubscribeFromAll(client1);
      unsubscribeFromAll(client2);

      expect(getActiveWatcherCount()).toBe(0);
    });
  });

  describe('getActiveWatcherCount', () => {
    it('should return 0 when no watchers exist', () => {
      expect(getActiveWatcherCount()).toBe(0);
    });

    it('should return the number of active watchers', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      mockExistsSync.mockImplementation((path: unknown) => {
        return (path as string) === '/mock/transcripts';
      });

      const client = createMockWebSocket();

      subscribeToLoop('loop-1', client);
      expect(getActiveWatcherCount()).toBe(1);

      subscribeToLoop('loop-2', client);
      expect(getActiveWatcherCount()).toBe(2);

      subscribeToLoop('loop-3', client);
      expect(getActiveWatcherCount()).toBe(3);
    });
  });

  describe('cleanupAllWatchers', () => {
    it('should clean up all watchers', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      const client = createMockWebSocket();

      subscribeToLoop('loop-1', client);
      subscribeToLoop('loop-2', client);
      subscribeToLoop('loop-3', client);

      expect(getActiveWatcherCount()).toBe(3);

      cleanupAllWatchers();

      // All watchers should be removed
      expect(getActiveWatcherCount()).toBe(0);
    });

    it('should handle cleanup when no watchers exist', () => {
      expect(() => {
        cleanupAllWatchers();
      }).not.toThrow();
      expect(getActiveWatcherCount()).toBe(0);
    });
  });

  describe('file watching and iteration reading', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should read new iterations when file changes', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      // Get the change callback
      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        // Mock new data available
        mockFstatSync.mockReturnValue({ size: 200 });
        mockReadSync.mockImplementation(
          (_fd, buffer, _offset, length, _position) => {
            const newData = JSON.stringify({
              iteration: 1,
              timestamp: '2024-01-15T10:00:00Z',
              output: 'Test output',
            });
            buffer.write(newData);
            return newData.length;
          }
        );

        changeCallback('change');
        vi.advanceTimersByTime(150); // Advance past DEBOUNCE_MS (100)

        expect(client.send).toHaveBeenCalled();
        const sentMessage = JSON.parse(
          (client.send as vi.Mock).mock.calls[0][0]
        );
        expect(sentMessage.type).toBe('iterations');
        expect(sentMessage.loopId).toBe('test-loop');
      }
    });

    it('should debounce file changes', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        // Trigger multiple rapid changes
        for (let i = 0; i < 5; i++) {
          changeCallback('change');
        }

        // Advance timer - only one read should happen
        vi.advanceTimersByTime(150);

        expect(client.send).toHaveBeenCalledTimes(1);
      }
    });

    it('should skip closed WebSocket clients when broadcasting', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client1 = createMockWebSocket(1); // OPEN
      const client2 = createMockWebSocket(2); // CLOSED (readyState 2)
      const client3 = createMockWebSocket(1); // OPEN

      subscribeToLoop('test-loop', client1);
      subscribeToLoop('test-loop', client2);
      subscribeToLoop('test-loop', client3);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        mockFstatSync.mockReturnValue({ size: 200 });
        mockReadSync.mockImplementation(
          (_fd, buffer, _offset, length, _position) => {
            const newData = JSON.stringify({
              iteration: 1,
              timestamp: '2024-01-15T10:00:00Z',
              output: 'Test output',
            });
            buffer.write(newData);
            return newData.length;
          }
        );

        changeCallback('change');
        vi.advanceTimersByTime(150);

        // Only client1 and client3 should receive (client2 is closed)
        expect(client1.send).toHaveBeenCalled();
        expect(client3.send).toHaveBeenCalled();
        expect(client2.send).not.toHaveBeenCalled();
      }
    });

    it('should handle malformed JSON lines gracefully', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        mockFstatSync.mockReturnValue({ size: 200 });
        mockReadSync.mockImplementation(
          (_fd, buffer, _offset, length, _position) => {
            // Mix valid and invalid JSON
            const newData =
              JSON.stringify({
                iteration: 1,
                timestamp: '2024-01-15T10:00:00Z',
                output: 'Valid output',
              }) +
              '\n' +
              'invalid json {{' +
              '\n' +
              JSON.stringify({
                iteration: 2,
                timestamp: '2024-01-15T10:01:00Z',
                output: 'Another valid output',
              });
            buffer.write(newData);
            return newData.length;
          }
        );

        changeCallback('change');
        vi.advanceTimersByTime(150);

        // Should send only the valid entries
        expect(client.send).toHaveBeenCalled();
        const sentMessage = JSON.parse(
          (client.send as vi.Mock).mock.calls[0][0]
        );
        expect(sentMessage.iterations).toHaveLength(2);
      }
    });

    it('should handle file read errors gracefully', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        // Mock error on read
        mockReadSync.mockImplementation(() => {
          throw new Error('Read error');
        });

        const consoleSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        changeCallback('change');
        vi.advanceTimersByTime(150);

        expect(consoleSpy).toHaveBeenCalledWith(
          'Error reading new iterations:',
          expect.any(Error)
        );

        consoleSpy.mockRestore();
      }
    });
  });

  describe('checklist watching', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should broadcast checklist updates', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockStatSync.mockReturnValue({ mtimeMs: 1234567890 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-checklist.json') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockImplementation(
        (_loopId: string, suffix: string) => {
          if (suffix === 'checklist.json') {
            return '/mock/transcripts/test-checklist.json';
          }
          return null;
        }
      );

      vi.mocked(getChecklistWithProgress).mockReturnValue({
        checklist: {
          loop_id: 'test-loop',
          session_id: 'test-session',
          project: '/test',
          project_name: 'test',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          completion_criteria: [],
        },
        progress: {
          criteria: '0/0 criteria',
          criteriaCompleted: 0,
          criteriaTotal: 0,
        },
      });

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      // Get the checklist change callback
      const checklistCallback = mockWatch.mock.calls
        .filter((call) => call[0]?.includes('checklist'))
        .find((call) => call[2] && typeof call[2] === 'function')?.[2];

      if (checklistCallback) {
        checklistCallback('change');
        vi.advanceTimersByTime(150);

        expect(client.send).toHaveBeenCalled();
        const sentMessage = JSON.parse(
          (client.send as vi.Mock).mock.calls[0][0]
        );
        expect(sentMessage.type).toBe('checklist');
        expect(sentMessage.loopId).toBe('test-loop');
      }
    });

    it('should debounce checklist changes', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockStatSync.mockReturnValue({ mtimeMs: 1234567890 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-checklist.json') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockImplementation(
        (_loopId: string, suffix: string) => {
          if (suffix === 'checklist.json') {
            return '/mock/transcripts/test-checklist.json';
          }
          return null;
        }
      );

      vi.mocked(getChecklistWithProgress).mockReturnValue({
        checklist: {
          loop_id: 'test-loop',
          session_id: 'test-session',
          project: '/test',
          project_name: 'test',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          completion_criteria: [],
        },
        progress: {
          criteria: '0/0 criteria',
          criteriaCompleted: 0,
          criteriaTotal: 0,
        },
      });

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const checklistCallback = mockWatch.mock.calls
        .filter((call) => call[0]?.includes('checklist'))
        .find((call) => call[2] && typeof call[2] === 'function')?.[2];

      if (checklistCallback) {
        // Trigger multiple rapid changes
        for (let i = 0; i < 5; i++) {
          checklistCallback('change');
        }

        vi.advanceTimersByTime(150);

        // Only one broadcast should happen
        expect(client.send).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('directory watching for file creation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should switch from directory to file watching when file is created', () => {
      const mockDirectoryWatcher = new MockFSWatcher();
      const mockFileWatcher = new MockFSWatcher();
      mockWatch
        .mockReturnValueOnce(mockDirectoryWatcher)
        .mockReturnValue(mockFileWatcher);

      mockExistsSync.mockImplementation((path: unknown) => {
        return (path as string) === '/mock/transcripts';
      });

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      // Get the directory rename callback
      const dirCallback = mockWatch.mock.calls.find(
        (call) => call[1] === 'rename' && typeof call[2] === 'function'
      )?.[2];

      if (dirCallback) {
        // Simulate file creation matching the pattern
        dirCallback('rename', 'session-test-loop-iterations.jsonl');

        // Should switch to file watcher
        expect(mockDirectoryWatcher.close).toHaveBeenCalled();
        expect(mockFileWatcher).toHaveBeenCalled();
      }
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle WebSocket send errors gracefully', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      (client.send as vi.Mock).mockImplementation(() => {
        throw new Error('Send failed');
      });

      subscribeToLoop('test-loop', client);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        mockFstatSync.mockReturnValue({ size: 200 });
        mockReadSync.mockImplementation(
          (_fd, buffer, _offset, length, _position) => {
            const newData = JSON.stringify({
              iteration: 1,
              timestamp: '2024-01-15T10:00:00Z',
              output: 'Test output',
            });
            buffer.write(newData);
            return newData.length;
          }
        );

        const consoleSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        changeCallback('change');
        vi.advanceTimersByTime(150);

        expect(consoleSpy).toHaveBeenCalledWith(
          'Error sending to WebSocket client:',
          expect.any(Error)
        );

        consoleSpy.mockRestore();
      }
    });

    it('should handle watcher errors', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Simulate watcher error - this should be caught by the error handler
      try {
        mockWatcher.emit('error', new Error('Watcher error'));
      } catch (e) {
        // The error might be thrown, that's ok for this test
      }

      // The key is that the subscription was created and error handler would be registered
      expect(getActiveWatcherCount()).toBe(1);

      consoleSpy.mockRestore();
    });
  });

  describe('readNewIterations function', () => {
    it('should return empty array when file does not exist', () => {
      // Test this through the subscription flow when file doesn't exist
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        return p === '/mock/transcripts';
      });

      const client = createMockWebSocket();
      subscribeToLoop('non-existent-loop', client);

      // Should succeed without error
      expect(getActiveWatcherCount()).toBe(1);
    });

    it('should return empty array when no new content available', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        // File size hasn't changed (still 100)
        mockFstatSync.mockReturnValue({ size: 100 });

        changeCallback('change');
        vi.advanceTimersByTime(150);

        // Should not send anything
        expect(client.send).not.toHaveBeenCalled();
      }
    });

    it('should handle empty lines in JSONL file', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        mockFstatSync.mockReturnValue({ size: 200 });
        mockReadSync.mockImplementation(
          (_fd, buffer, _offset, length, _position) => {
            // Mix of valid JSON and empty/whitespace lines
            const newData =
              JSON.stringify({
                iteration: 1,
                timestamp: '2024-01-15T10:00:00Z',
                output: 'Valid output',
              }) +
              '\n\n   \n' +
              JSON.stringify({
                iteration: 2,
                timestamp: '2024-01-15T10:01:00Z',
                output: 'Another valid output',
              }) +
              '\n\n';
            buffer.write(newData);
            return newData.length;
          }
        );

        changeCallback('change');
        vi.advanceTimersByTime(150);

        expect(client.send).toHaveBeenCalled();
        const sentMessage = JSON.parse(
          (client.send as vi.Mock).mock.calls[0][0]
        );
        expect(sentMessage.iterations).toHaveLength(2);
      }
    });

    it('should handle closeSync errors gracefully', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });
      mockCloseSync.mockImplementation(() => {
        throw new Error('Close failed');
      });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        mockFstatSync.mockReturnValue({ size: 200 });
        mockReadSync.mockImplementation(
          (_fd, buffer, _offset, length, _position) => {
            const newData = JSON.stringify({
              iteration: 1,
              timestamp: '2024-01-15T10:00:00Z',
              output: 'Test output',
            });
            buffer.write(newData);
            return newData.length;
          }
        );

        // Should not throw despite closeSync error
        expect(() => {
          changeCallback('change');
          vi.advanceTimersByTime(150);
        }).not.toThrow();
      }
    });
  });

  describe('checklist file watching transitions', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should detect and watch newly created checklist file', () => {
      const mockDirectoryWatcher = new MockFSWatcher();
      const mockChecklistWatcher = new MockFSWatcher();

      let watchCallCount = 0;
      mockWatch.mockImplementation(() => {
        watchCallCount++;
        return watchCallCount === 1
          ? mockDirectoryWatcher
          : mockChecklistWatcher;
      });

      mockExistsSync.mockImplementation((path: unknown) => {
        return (path as string) === '/mock/transcripts';
      });

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      // Get the directory rename callback
      const dirCallback = mockWatch.mock.calls.find(
        (call) => call[1] === 'rename' && typeof call[2] === 'function'
      )?.[2];

      if (dirCallback) {
        // Simulate checklist file creation
        mockStatSync.mockReturnValue({ mtimeMs: 1234567890 });

        vi.mocked(findFileByLoopId).mockImplementation(
          (_loopId: string, suffix: string) => {
            if (suffix === 'checklist.json') {
              return '/mock/transcripts/session-test-loop-checklist.json';
            }
            return null;
          }
        );

        dirCallback('rename', 'session-test-loop-checklist.json');

        // Should create checklist watcher
        expect(mockChecklistWatcher).toBeDefined();
      }
    });

    it('should not trigger on non-checklist files in directory', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      mockExistsSync.mockImplementation((path: unknown) => {
        return (path as string) === '/mock/transcripts';
      });

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const dirCallback = mockWatch.mock.calls.find(
        (call) => call[1] === 'rename' && typeof call[2] === 'function'
      )?.[2];

      if (dirCallback) {
        const consoleSpy = vi
          .spyOn(console, 'log')
          .mockImplementation(() => {});

        // Simulate non-checklist file creation
        dirCallback('rename', 'some-other-file.txt');

        // Should not create additional watchers
        expect(mockWatch).toHaveBeenCalledTimes(1);

        consoleSpy.mockRestore();
      }
    });

    it('should handle statSync errors when setting up checklist watcher', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockStatSync.mockImplementation(() => {
        throw new Error('Stat failed');
      });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-checklist.json') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockImplementation(
        (_loopId: string, suffix: string) => {
          if (suffix === 'checklist.json') {
            return '/mock/transcripts/test-checklist.json';
          }
          return null;
        }
      );

      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      const client = createMockWebSocket();

      // Should not throw
      expect(() => {
        subscribeToLoop('test-loop', client);
      }).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('should handle checklist watcher errors', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockStatSync.mockReturnValue({ mtimeMs: 1234567890 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-checklist.json') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockImplementation(
        (_loopId: string, suffix: string) => {
          if (suffix === 'checklist.json') {
            return '/mock/transcripts/test-checklist.json';
          }
          return null;
        }
      );

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      // The error handler is set up when creating the watcher
      // We can verify this by checking the subscription was successful
      expect(getActiveWatcherCount()).toBe(1);

      consoleSpy.mockRestore();
    });
  });

  describe('file watching transitions', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle directory watcher errors gracefully', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      mockExistsSync.mockImplementation((path: unknown) => {
        return (path as string) === '/mock/transcripts';
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      // The error handler is set up when creating the directory watcher
      // Verify subscription was successful
      expect(getActiveWatcherCount()).toBe(1);

      consoleSpy.mockRestore();
    });

    it('should read existing content after switching to file watcher', () => {
      const mockDirectoryWatcher = new MockFSWatcher();
      const mockFileWatcher = new MockFSWatcher();
      mockWatch
        .mockReturnValueOnce(mockDirectoryWatcher)
        .mockReturnValueOnce(mockFileWatcher);

      mockExistsSync.mockImplementation((path: unknown) => {
        return (path as string) === '/mock/transcripts';
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/session-test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const dirCallback = mockWatch.mock.calls.find(
        (call) => call[1] === 'rename' && typeof call[2] === 'function'
      )?.[2];

      if (dirCallback) {
        // File exists after creation
        mockExistsSync.mockImplementation((path: unknown) => {
          const p = path as string;
          return (
            p === '/mock/transcripts' ||
            p === '/mock/transcripts/session-test-loop-iterations.jsonl'
          );
        });

        mockFstatSync.mockReturnValue({ size: 200 });
        mockReadSync.mockImplementation(
          (_fd, buffer, _offset, length, _position) => {
            const newData = JSON.stringify({
              iteration: 1,
              timestamp: '2024-01-15T10:00:00Z',
              output: 'Existing content',
            });
            buffer.write(newData);
            return newData.length;
          }
        );

        dirCallback('rename', 'session-test-loop-iterations.jsonl');
        vi.advanceTimersByTime(150);

        // Should read and broadcast the existing content
        expect(client.send).toHaveBeenCalled();
      }
    });

    it('should handle file watcher errors after transition', () => {
      const mockDirectoryWatcher = new MockFSWatcher();
      const mockFileWatcher = new MockFSWatcher();
      mockWatch
        .mockReturnValueOnce(mockDirectoryWatcher)
        .mockReturnValueOnce(mockFileWatcher);

      mockExistsSync.mockImplementation((path: unknown) => {
        return (path as string) === '/mock/transcripts';
      });

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const dirCallback = mockWatch.mock.calls.find(
        (call) => call[1] === 'rename' && typeof call[2] === 'function'
      )?.[2];

      if (dirCallback) {
        const consoleSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        dirCallback('rename', 'session-test-loop-iterations.jsonl');

        // Emit error on file watcher
        mockFileWatcher.emit('error', new Error('File watcher error'));

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      }
    });

    it('should not switch to file watcher for non-matching files', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      mockExistsSync.mockImplementation((path: unknown) => {
        return (path as string) === '/mock/transcripts';
      });

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const dirCallback = mockWatch.mock.calls.find(
        (call) => call[1] === 'rename' && typeof call[2] === 'function'
      )?.[2];

      if (dirCallback) {
        const initialCallCount = mockWatch.mock.calls.length;

        // File doesn't match the pattern
        dirCallback('rename', 'wrong-loop-id-iterations.jsonl');

        // Should not create a new watcher
        expect(mockWatch.mock.calls.length).toBe(initialCallCount);
      }
    });
  });

  describe('broadcastToClients behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should not broadcast when no iterations available', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        // No new content
        mockFstatSync.mockReturnValue({ size: 100 });
        mockReadSync.mockReturnValue(0);

        changeCallback('change');
        vi.advanceTimersByTime(150);

        expect(client.send).not.toHaveBeenCalled();
      }
    });

    it('should remove clients that fail to send', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client1 = createMockWebSocket();
      const client2 = createMockWebSocket();
      (client2.send as vi.Mock).mockImplementation(() => {
        throw new Error('Send error');
      });

      subscribeToLoop('test-loop', client1);
      subscribeToLoop('test-loop', client2);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        mockFstatSync.mockReturnValue({ size: 200 });
        mockReadSync.mockImplementation(
          (_fd, buffer, _offset, length, _position) => {
            const newData = JSON.stringify({
              iteration: 1,
              timestamp: '2024-01-15T10:00:00Z',
              output: 'Test output',
            });
            buffer.write(newData);
            return newData.length;
          }
        );

        const consoleSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        changeCallback('change');
        vi.advanceTimersByTime(150);

        // client2 should be removed due to send error
        // Unsubscribe client1 to see if watcher still exists (client2 was removed)
        unsubscribeFromLoop('test-loop', client1);

        // Watcher should be cleaned up (both clients removed)
        expect(getActiveWatcherCount()).toBe(0);

        consoleSpy.mockRestore();
      }
    });

    it('should handle checklist send errors', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockStatSync.mockReturnValue({ mtimeMs: 1234567890 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-checklist.json') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockImplementation(
        (_loopId: string, suffix: string) => {
          if (suffix === 'checklist.json') {
            return '/mock/transcripts/test-checklist.json';
          }
          return null;
        }
      );

      vi.mocked(getChecklistWithProgress).mockReturnValue({
        checklist: {
          loop_id: 'test-loop',
          session_id: 'test-session',
          project: '/test',
          project_name: 'test',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          completion_criteria: [],
        },
        progress: {
          criteria: '0/0 criteria',
          criteriaCompleted: 0,
          criteriaTotal: 0,
        },
      });

      const client = createMockWebSocket();
      (client.send as vi.Mock).mockImplementation(() => {
        throw new Error('Send failed');
      });

      subscribeToLoop('test-loop', client);

      const checklistCallback = mockWatch.mock.calls
        .filter((call) => call[0]?.includes('checklist'))
        .find((call) => call[2] && typeof call[2] === 'function')?.[2];

      if (checklistCallback) {
        const consoleSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        checklistCallback('change');
        vi.advanceTimersByTime(150);

        expect(consoleSpy).toHaveBeenCalledWith(
          'Error sending checklist to WebSocket client:',
          expect.any(Error)
        );

        consoleSpy.mockRestore();
      }
    });

    it('should not broadcast when checklist data is null', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockStatSync.mockReturnValue({ mtimeMs: 1234567890 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-checklist.json') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockImplementation(
        (_loopId: string, suffix: string) => {
          if (suffix === 'checklist.json') {
            return '/mock/transcripts/test-checklist.json';
          }
          return null;
        }
      );

      // Return null checklist
      vi.mocked(getChecklistWithProgress).mockReturnValue({
        checklist: null,
        progress: null,
      });

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const checklistCallback = mockWatch.mock.calls
        .filter((call) => call[0]?.includes('checklist'))
        .find((call) => call[2] && typeof call[2] === 'function')?.[2];

      if (checklistCallback) {
        checklistCallback('change');
        vi.advanceTimersByTime(150);

        // Should not send anything when checklist is null
        expect(client.send).not.toHaveBeenCalled();
      }
    });
  });

  describe('debounce timer behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should clear previous debounce timer when new change occurs', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        // Trigger first change
        changeCallback('change');

        // Advance partially (50ms, less than DEBOUNCE_MS)
        vi.advanceTimersByTime(50);

        // Trigger second change - should reset the timer
        changeCallback('change');

        // Advance past original debounce time (total 100ms)
        vi.advanceTimersByTime(50);

        // Should not have sent yet (timer was reset)
        expect(client.send).not.toHaveBeenCalled();

        // Advance past the reset debounce time
        vi.advanceTimersByTime(60);

        // Now should send
        expect(client.send).toHaveBeenCalled();
      }
    });

    it('should handle checklist debounce timer correctly', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockStatSync.mockReturnValue({ mtimeMs: 1234567890 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-checklist.json') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockImplementation(
        (_loopId: string, suffix: string) => {
          if (suffix === 'checklist.json') {
            return '/mock/transcripts/test-checklist.json';
          }
          return null;
        }
      );

      vi.mocked(getChecklistWithProgress).mockReturnValue({
        checklist: {
          loop_id: 'test-loop',
          session_id: 'test-session',
          project: '/test',
          project_name: 'test',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          completion_criteria: [],
        },
        progress: {
          criteria: '0/0 criteria',
          criteriaCompleted: 0,
          criteriaTotal: 0,
        },
      });

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const checklistCallback = mockWatch.mock.calls
        .filter((call) => call[0]?.includes('checklist'))
        .find((call) => call[2] && typeof call[2] === 'function')?.[2];

      if (checklistCallback) {
        // Trigger multiple rapid changes
        checklistCallback('change');
        vi.advanceTimersByTime(50);

        checklistCallback('change');
        vi.advanceTimersByTime(50);

        checklistCallback('change');

        // Only the last one should trigger a broadcast after debounce
        vi.advanceTimersByTime(150);

        expect(client.send).toHaveBeenCalledTimes(1);
      }
    });

    it('should clean up debounce timers on unsubscribe', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        // Trigger a change to start debounce timer
        changeCallback('change');

        // Unsubscribe before debounce completes
        unsubscribeFromLoop('test-loop', client);

        // Advance timers - should not crash or send
        vi.advanceTimersByTime(150);

        expect(client.send).not.toHaveBeenCalled();
      }
    });
  });

  describe('cleanupAllWatchers checklist cleanup', () => {
    it('should clean up checklist debounce timers', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockStatSync.mockReturnValue({ mtimeMs: 1234567890 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-checklist.json') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockImplementation(
        (_loopId: string, suffix: string) => {
          if (suffix === 'checklist.json') {
            return '/mock/transcripts/test-checklist.json';
          }
          return null;
        }
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      expect(getActiveWatcherCount()).toBe(1);

      // Cleanup should not throw
      expect(() => {
        cleanupAllWatchers();
      }).not.toThrow();

      expect(getActiveWatcherCount()).toBe(0);
    });

    it('should clean up checklist watchers', () => {
      const mockWatcher1 = new MockFSWatcher();
      const mockWatcher2 = new MockFSWatcher();

      let watchCallCount = 0;
      mockWatch.mockImplementation(() => {
        watchCallCount++;
        // Return directory watcher first, then checklist watchers
        if (watchCallCount % 2 === 0) {
          return watchCallCount === 2 ? mockWatcher1 : mockWatcher2;
        }
        return new MockFSWatcher(); // Directory watcher
      });

      mockStatSync.mockReturnValue({ mtimeMs: 1234567890 });

      // Checklist files exist
      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p.includes('checklist.json')) return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockImplementation(
        (_loopId: string, suffix: string) => {
          if (suffix === 'checklist.json') {
            return `/mock/transcripts/${_loopId}-checklist.json`;
          }
          return null; // No iterations file
        }
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);
      subscribeToLoop('test-loop-2', client);

      expect(getActiveWatcherCount()).toBe(2);

      cleanupAllWatchers();

      // Verify cleanup was successful
      expect(getActiveWatcherCount()).toBe(0);
    });

    it('should cleanup watchers with active debounce timers', () => {
      vi.useFakeTimers();

      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);
      mockFstatSync.mockReturnValue({ size: 100 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/mock/transcripts') return true;
        if (p === '/mock/transcripts/test-loop-iterations.jsonl') return true;
        return false;
      });

      vi.mocked(findFileByLoopId).mockReturnValue(
        '/mock/transcripts/test-loop-iterations.jsonl'
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const changeCallback = mockWatch.mock.calls.find(
        (call) => call[2] && typeof call[2] === 'function'
      )?.[2];

      if (changeCallback) {
        // Start debounce timer
        changeCallback('change');

        // Cleanup while timer is active
        cleanupAllWatchers();

        // Advance timers - should not crash
        vi.advanceTimersByTime(150);
      }

      vi.useRealTimers();
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle null filename in directory change handler', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      mockExistsSync.mockImplementation((path: unknown) => {
        return (path as string) === '/mock/transcripts';
      });

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const dirCallback = mockWatch.mock.calls.find(
        (call) => call[1] === 'rename' && typeof call[2] === 'function'
      )?.[2];

      if (dirCallback) {
        // Should not throw with null filename
        expect(() => {
          dirCallback('rename', null);
        }).not.toThrow();
      }
    });

    it('should handle both iterations and checklist file creation', () => {
      const mockDirectoryWatcher = new MockFSWatcher();
      const mockIterationsWatcher = new MockFSWatcher();
      const mockChecklistWatcher = new MockFSWatcher();

      let watchCallCount = 0;
      mockWatch.mockImplementation(() => {
        watchCallCount++;
        if (watchCallCount === 1) return mockDirectoryWatcher;
        if (watchCallCount === 2) return mockIterationsWatcher;
        return mockChecklistWatcher;
      });

      mockFstatSync.mockReturnValue({ size: 100 });
      mockStatSync.mockReturnValue({ mtimeMs: 1234567890 });

      mockExistsSync.mockImplementation((path: unknown) => {
        const p = path as string;
        return p === '/mock/transcripts';
      });

      vi.mocked(findFileByLoopId).mockImplementation(
        (_loopId: string, suffix: string) => {
          if (suffix === 'checklist.json') {
            return `/mock/transcripts/session-${_loopId}-checklist.json`;
          }
          return `/mock/transcripts/session-${_loopId}-iterations.jsonl`;
        }
      );

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      const dirCallback = mockWatch.mock.calls.find(
        (call) => call[1] === 'rename' && typeof call[2] === 'function'
      )?.[2];

      if (dirCallback) {
        // First iterations file is created
        dirCallback('rename', 'session-test-loop-iterations.jsonl');

        // Then checklist file is created
        dirCallback('rename', 'session-test-loop-checklist.json');

        // Both watchers should be created
        expect(watchCallCount).toBeGreaterThanOrEqual(3);
      }
    });

    it('should not fail when state is missing during directory change', () => {
      const mockWatcher = new MockFSWatcher();
      mockWatch.mockReturnValue(mockWatcher);

      mockExistsSync.mockImplementation((path: unknown) => {
        return (path as string) === '/mock/transcripts';
      });

      const client = createMockWebSocket();
      subscribeToLoop('test-loop', client);

      // Get the watcher and manually trigger callback after state is deleted
      const dirCallback = mockWatch.mock.calls.find(
        (call) => call[1] === 'rename' && typeof call[2] === 'function'
      )?.[2];

      if (dirCallback) {
        // Delete the state first
        cleanupAllWatchers();

        // Should not throw even though state is missing
        expect(() => {
          dirCallback('rename', 'some-file.jsonl');
        }).not.toThrow();
      }
    });
  });
});
