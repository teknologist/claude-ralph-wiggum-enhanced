import type { IterationEntry } from '../../server/types';

type IterationCallback = (iterations: IterationEntry[]) => void;
type ErrorCallback = (message: string) => void;

class TranscriptWebSocket {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, Set<IterationCallback>> = new Map();
  private errorCallbacks: Set<ErrorCallback> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentLoopId: string | null = null;

  /**
   * Get the WebSocket URL for a given loopId.
   */
  private getWsUrl(loopId: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws?loopId=${encodeURIComponent(loopId)}`;
  }

  /**
   * Connect to WebSocket for a specific loopId.
   */
  private connect(loopId: string): void {
    if (
      this.ws?.readyState === WebSocket.OPEN &&
      this.currentLoopId === loopId
    ) {
      return; // Already connected to this loop
    }

    // Close existing connection if connecting to different loop
    if (this.ws && this.currentLoopId !== loopId) {
      this.ws.close();
    }

    this.currentLoopId = loopId;
    const url = this.getWsUrl(loopId);

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log(`WebSocket connected for loop: ${loopId}`);
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'iterations' && data.loopId && data.iterations) {
            this.handleIterations(data.loopId, data.iterations);
          } else if (data.type === 'error' && data.message) {
            // Handle error messages from server (e.g., rate limiting)
            console.warn('WebSocket error from server:', data.message);
            this.notifyError(data.message);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log(`WebSocket closed: ${event.code} ${event.reason}`);
        this.ws = null;

        // Only reconnect if we still have subscriptions
        if (
          this.subscriptions.size > 0 &&
          this.reconnectAttempts < this.maxReconnectAttempts
        ) {
          // Use currentLoopId or first subscription to reconnect
          const reconnectLoopId =
            this.currentLoopId || this.subscriptions.keys().next().value;
          if (reconnectLoopId) {
            this.scheduleReconnect(reconnectLoopId);
          }
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(loopId: string): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(
      `Scheduling WebSocket reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect(loopId);
    }, delay);
  }

  /**
   * Handle incoming iterations from WebSocket.
   */
  private handleIterations(loopId: string, iterations: IterationEntry[]): void {
    const callbacks = this.subscriptions.get(loopId);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(iterations);
        } catch (error) {
          console.error('Error in iteration callback:', error);
        }
      });
    }
  }

  /**
   * Notify error callbacks of server errors.
   */
  private notifyError(message: string): void {
    this.errorCallbacks.forEach((callback) => {
      try {
        callback(message);
      } catch (error) {
        console.error('Error in error callback:', error);
      }
    });
  }

  /**
   * Subscribe to iteration updates for a loopId.
   * Returns an unsubscribe function.
   */
  subscribe(loopId: string, callback: IterationCallback): () => void {
    // Add to subscriptions
    if (!this.subscriptions.has(loopId)) {
      this.subscriptions.set(loopId, new Set());
    }
    this.subscriptions.get(loopId)!.add(callback);

    // Connect if not already connected
    this.connect(loopId);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscriptions.get(loopId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscriptions.delete(loopId);
        }
      }

      // Close WebSocket if no more subscriptions
      if (this.subscriptions.size === 0) {
        this.disconnect();
      }
    };
  }

  /**
   * Register an error callback for server-side errors.
   */
  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => {
      this.errorCallbacks.delete(callback);
    };
  }

  /**
   * Disconnect and cleanup.
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.currentLoopId = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const transcriptWebSocket = new TranscriptWebSocket();

/**
 * Subscribe to transcript iterations for a loopId.
 * Returns an unsubscribe function.
 */
export function subscribeToTranscript(
  loopId: string,
  onIterations: IterationCallback
): () => void {
  return transcriptWebSocket.subscribe(loopId, onIterations);
}
