import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  subscribeToTranscript,
  subscribeToChecklist,
  transcriptWebSocket,
} from '../lib/websocket';
import type {
  IterationEntry,
  Checklist,
  ChecklistProgress,
} from '../../server/types';

// Mock WebSocket - simple synchronous mock
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  url = '';
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
  }

  send(_data: string) {
    // No-op for tests
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

// @ts-ignore
global.WebSocket = MockWebSocket;

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    protocol: 'http:',
    host: 'localhost:3847',
  },
  writable: true,
});

describe('websocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transcriptWebSocket.disconnect();
  });

  describe('subscribeToTranscript', () => {
    it('returns an unsubscribe function', () => {
      const unsubscribe = subscribeToTranscript('test-loop', vi.fn());
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('adds subscription for a loop', () => {
      const callback = vi.fn();
      subscribeToTranscript('test-loop', callback);

      const ws = transcriptWebSocket as any;
      expect(ws.subscriptions.size).toBeGreaterThan(0);
    });

    it('handles multiple subscriptions', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      subscribeToTranscript('test-loop', callback1);
      subscribeToTranscript('test-loop', callback2);

      const ws = transcriptWebSocket as any;
      expect(ws.subscriptions.size).toBe(1);
      expect(ws.subscriptions.get('test-loop')?.size).toBe(2);
    });

    it('removes subscription when unsubscribe is called', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToTranscript('test-loop', callback);

      unsubscribe();

      const ws = transcriptWebSocket as any;
      // After unsubscribe, the key should be deleted when no more subscriptions
      expect(ws.subscriptions.has('test-loop')).toBe(false);
    });
  });

  describe('subscribeToChecklist', () => {
    it('returns an unsubscribe function', () => {
      const unsubscribe = subscribeToChecklist('test-loop', vi.fn());
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('adds checklist subscription for a loop', () => {
      const callback = vi.fn();
      subscribeToChecklist('test-loop', callback);

      const ws = transcriptWebSocket as any;
      expect(ws.checklistSubscriptions.size).toBeGreaterThan(0);
    });

    it('removes checklist subscription when unsubscribe is called', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToChecklist('test-loop', callback);

      unsubscribe();

      const ws = transcriptWebSocket as any;
      expect(ws.checklistSubscriptions.has('test-loop')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('registers error callback', () => {
      const errorCallback = vi.fn();
      const unregister = transcriptWebSocket.onError(errorCallback);

      expect(typeof unregister).toBe('function');
      unregister();
    });

    it('removes error callback when unregistering', () => {
      const errorCallback = vi.fn();
      const unregister = transcriptWebSocket.onError(errorCallback);

      unregister();

      const ws = transcriptWebSocket as any;
      expect(ws.errorCallbacks.has(errorCallback)).toBe(false);
    });
  });

  describe('connection lifecycle', () => {
    it('starts disconnected', () => {
      expect(transcriptWebSocket.isConnected()).toBe(false);
    });

    it('disconnects and clears state', () => {
      subscribeToTranscript('test-loop', vi.fn());
      subscribeToChecklist('test-loop', vi.fn());

      transcriptWebSocket.disconnect();

      const ws = transcriptWebSocket as any;
      expect(ws.ws).toBeNull();
      expect(ws.subscriptions.size).toBe(0);
      expect(ws.checklistSubscriptions.size).toBe(0);
      expect(ws.currentLoopId).toBeNull();
    });

    it('clears subscriptions on disconnect', () => {
      subscribeToTranscript('test-loop', vi.fn());

      transcriptWebSocket.disconnect();

      const ws = transcriptWebSocket as any;
      expect(ws.subscriptions.size).toBe(0);
      expect(ws.checklistSubscriptions.size).toBe(0);
    });
  });

  describe('message handling', () => {
    it('handles iteration messages', () => {
      const callback = vi.fn();
      subscribeToTranscript('test-loop', callback);

      const ws = transcriptWebSocket as any;
      const iterations: IterationEntry[] = [
        {
          iteration: 1,
          timestamp: '2024-01-15T10:00:00Z',
          output: 'Test output',
        },
      ];

      // Call the internal handler directly
      ws.handleIterations('test-loop', iterations);

      expect(callback).toHaveBeenCalledWith(iterations);
    });

    it('handles iteration callback errors gracefully', () => {
      // Create a callback that throws an error
      const errorCallback = new Error('Iteration callback failed');
      const callback = vi.fn(() => {
        throw errorCallback;
      });
      subscribeToTranscript('test-loop', callback);

      const ws = transcriptWebSocket as any;
      const iterations: IterationEntry[] = [
        {
          iteration: 1,
          timestamp: '2024-01-15T10:00:00Z',
          output: 'Test output',
        },
      ];

      // Mock console.error to verify it's called
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Call the internal handler - should not throw
      ws.handleIterations('test-loop', iterations);

      // Verify callback was called despite the error
      expect(callback).toHaveBeenCalled();
      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in iteration callback:',
        errorCallback
      );

      consoleSpy.mockRestore();
    });

    it('handles checklist messages', () => {
      const callback = vi.fn();
      subscribeToChecklist('test-loop', callback);

      const ws = transcriptWebSocket as any;
      const checklist: Checklist = {
        loop_id: 'test-loop',
        session_id: 'test-session',
        project: '/test/project',
        project_name: 'test-project',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        completion_criteria: [
          {
            id: 'c1',
            text: 'Criterion 1',
            status: 'pending',
            created_at: '2024-01-15T10:00:00Z',
          },
        ],
      };
      const progress: ChecklistProgress = {
        criteria: 'test',
        criteriaCompleted: 0,
        criteriaTotal: 1,
      };

      // Call the internal handler directly
      ws.handleChecklist('test-loop', checklist, progress);

      expect(callback).toHaveBeenCalledWith({
        loopId: 'test-loop',
        checklist,
        progress,
      });
    });

    it('handles error messages from server', () => {
      const errorCallback = vi.fn();
      transcriptWebSocket.onError(errorCallback);

      const ws = transcriptWebSocket as any;

      // Call the internal handler directly
      ws.notifyError('Rate limit exceeded');

      expect(errorCallback).toHaveBeenCalledWith('Rate limit exceeded');
    });

    it('handles JSON parsing errors gracefully', () => {
      subscribeToTranscript('test-loop', vi.fn());

      const ws = transcriptWebSocket as any;

      // Mock console.error to verify it's called
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Simulate receiving invalid JSON
      if (ws.ws && ws.ws.onmessage) {
        ws.ws.onmessage({ data: 'invalid json {{' });
      }

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error parsing WebSocket message:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('handles error messages from server via onmessage', () => {
      const errorCallback = vi.fn();
      transcriptWebSocket.onError(errorCallback);

      const ws = transcriptWebSocket as any;

      // Connect the WebSocket first (subscribing triggers connection)
      subscribeToTranscript('test-loop', vi.fn());

      // Mock console.warn to avoid cluttering test output
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Simulate receiving an error message from server
      if (ws.ws && ws.ws.onmessage) {
        ws.ws.onmessage({
          data: JSON.stringify({
            type: 'error',
            message: 'Rate limit exceeded',
          }),
        });
      }

      // Verify error callback was invoked
      expect(errorCallback).toHaveBeenCalledWith('Rate limit exceeded');

      consoleSpy.mockRestore();
    });

    it('handles checklist callback errors gracefully', () => {
      // Create a callback that throws an error
      const errorCallback = new Error('Callback failed');
      const callback = vi.fn(() => {
        throw errorCallback;
      });
      subscribeToChecklist('test-loop', callback);

      const ws = transcriptWebSocket as any;
      const checklist: Checklist = {
        loop_id: 'test-loop',
        session_id: 'test-session',
        project: '/test/project',
        project_name: 'test-project',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        completion_criteria: [
          {
            id: 'c1',
            text: 'Criterion 1',
            status: 'pending',
            created_at: '2024-01-15T10:00:00Z',
          },
        ],
      };
      const progress: ChecklistProgress = {
        criteria: 'test',
        criteriaCompleted: 0,
        criteriaTotal: 1,
      };

      // Mock console.error to verify it's called
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Call the internal handler - should not throw
      ws.handleChecklist('test-loop', checklist, progress);

      // Verify callback was called despite the error
      expect(callback).toHaveBeenCalled();
      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in checklist callback:',
        errorCallback
      );

      consoleSpy.mockRestore();
    });

    it('handles error callback errors gracefully', () => {
      // Create an error callback that throws an error
      const callbackError = new Error('Error callback failed');
      const errorCallback = vi.fn(() => {
        throw callbackError;
      });
      transcriptWebSocket.onError(errorCallback);

      const ws = transcriptWebSocket as any;

      // Mock console.error to verify it's called
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Call the internal handler - should not throw
      ws.notifyError('Test error message');

      // Verify callback was called despite the error
      expect(errorCallback).toHaveBeenCalledWith('Test error message');
      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in error callback:',
        callbackError
      );

      consoleSpy.mockRestore();
    });
  });

  describe('utility functions', () => {
    it('counts client subscriptions correctly', () => {
      const callback = vi.fn();
      subscribeToTranscript('loop1', callback);
      subscribeToTranscript('loop2', callback);

      // The mock WebSocket isn't a real ServerWebSocket, but we can test the concept
      const ws = transcriptWebSocket as any;
      expect(ws.subscriptions.size).toBe(2);
    });

    it('checks subscription count', () => {
      // Default max is 10 subscriptions
      for (let i = 0; i < 5; i++) {
        subscribeToTranscript(`loop${i}`, vi.fn());
      }

      // Should have 5 subscriptions
      const ws = transcriptWebSocket as any;
      expect(ws.subscriptions.size).toBe(5);
    });
  });
});
