import { watch, type FSWatcher } from 'fs';
import { openSync, readSync, fstatSync, closeSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import type { ServerWebSocket } from 'bun';
import type { IterationEntry } from './transcript-service';
import type { WebSocketData } from '../types';

const TRANSCRIPT_DIR = join(
  homedir(),
  '.claude',
  'ralph-wiggum-pro-logs',
  'transcripts'
);

interface FileWatchState {
  watcher: FSWatcher | null;
  lastSize: number;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  clients: Set<ServerWebSocket<WebSocketData>>;
  watchingDirectory: boolean; // Track if we're watching parent dir for file creation
}

// Track active watchers by loopId
const watchers = new Map<string, FileWatchState>();

// Debounce delay in ms
const DEBOUNCE_MS = 100;

// Maximum subscriptions per client (rate limiting)
const MAX_SUBSCRIPTIONS_PER_CLIENT = 10;

/**
 * Get the iterations file path for a loop.
 */
function getIterationsFilePath(loopId: string): string {
  return join(TRANSCRIPT_DIR, `${loopId}-iterations.jsonl`);
}

/**
 * Read only new bytes from a JSONL file since last read.
 * Uses byte offset tracking for efficient tail-reading.
 */
function readNewIterations(
  filePath: string,
  state: FileWatchState
): IterationEntry[] {
  if (!existsSync(filePath)) {
    return [];
  }

  let fd: number | null = null;
  try {
    fd = openSync(filePath, 'r');
    const stats = fstatSync(fd);

    // No new content
    if (stats.size <= state.lastSize) {
      return [];
    }

    // Read only new bytes
    const newBytesCount = stats.size - state.lastSize;
    const buffer = Buffer.alloc(newBytesCount);
    readSync(fd, buffer, 0, newBytesCount, state.lastSize);
    state.lastSize = stats.size;

    // Parse new content
    const newContent = buffer.toString('utf-8');
    const lines = newContent.split('\n').filter((line) => line.trim());

    const newEntries: IterationEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as IterationEntry;
        newEntries.push(entry);
      } catch {
        // Skip malformed lines
      }
    }

    return newEntries;
  } catch (error) {
    console.error('Error reading new iterations:', error);
    return [];
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Broadcast new iterations to all clients subscribed to a loopId.
 */
function broadcastIterations(
  loopId: string,
  iterations: IterationEntry[]
): void {
  const state = watchers.get(loopId);
  if (!state || iterations.length === 0) return;

  const message = JSON.stringify({
    type: 'iterations',
    loopId,
    iterations,
  });

  for (const client of state.clients) {
    // Check if WebSocket is open (readyState 1 = OPEN)
    if (client.readyState !== 1) {
      state.clients.delete(client);
      continue;
    }
    try {
      client.send(message);
    } catch (error) {
      console.error('Error sending to WebSocket client:', error);
      state.clients.delete(client);
    }
  }
}

/**
 * Handle file change with debouncing.
 */
function handleFileChange(loopId: string, filePath: string): void {
  const state = watchers.get(loopId);
  if (!state) return;

  // Clear existing debounce timer
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }

  // Debounce to avoid rapid successive reads
  state.debounceTimer = setTimeout(() => {
    const newIterations = readNewIterations(filePath, state);
    if (newIterations.length > 0) {
      broadcastIterations(loopId, newIterations);
    }
    state.debounceTimer = null;
  }, DEBOUNCE_MS);
}

/**
 * Handle directory change - check if our target file was created.
 */
function handleDirectoryChange(
  loopId: string,
  filePath: string,
  filename: string | null
): void {
  const state = watchers.get(loopId);
  if (!state || !state.watchingDirectory) return;

  const targetFilename = `${loopId}-iterations.jsonl`;

  // Check if the target file was created
  if (filename === targetFilename || existsSync(filePath)) {
    // Switch from directory watching to file watching
    if (state.watcher) {
      state.watcher.close();
    }

    state.watchingDirectory = false;
    state.watcher = watch(filePath, { persistent: false }, (eventType) => {
      if (eventType === 'change') {
        handleFileChange(loopId, filePath);
      }
    });

    state.watcher.on('error', (error) => {
      console.error(`Watcher error for ${loopId}:`, error);
    });

    console.log(`Switched to file watcher for loop: ${loopId}`);

    // Read any existing content
    handleFileChange(loopId, filePath);
  }
}

/**
 * Count how many loops a client is subscribed to.
 */
export function countClientSubscriptions(
  client: ServerWebSocket<WebSocketData>
): number {
  let count = 0;
  for (const state of watchers.values()) {
    if (state.clients.has(client)) {
      count++;
    }
  }
  return count;
}

/**
 * Check if a client can subscribe to more loops (rate limiting).
 */
export function canClientSubscribe(
  client: ServerWebSocket<WebSocketData>
): boolean {
  return countClientSubscriptions(client) < MAX_SUBSCRIPTIONS_PER_CLIENT;
}

/**
 * Start watching a transcript file for a loopId.
 * Creates watcher if one doesn't exist, or adds client to existing watcher.
 */
export function subscribeToLoop(
  loopId: string,
  client: ServerWebSocket<WebSocketData>
): { success: boolean; message?: string } {
  // Rate limiting check
  if (!canClientSubscribe(client)) {
    return {
      success: false,
      message: `Maximum subscriptions (${MAX_SUBSCRIPTIONS_PER_CLIENT}) reached`,
    };
  }

  const filePath = getIterationsFilePath(loopId);

  let state = watchers.get(loopId);

  if (!state) {
    // Initialize byte offset from existing file
    let lastSize = 0;
    let watcher: FSWatcher | null = null;
    let watchingDirectory = false;

    if (existsSync(filePath)) {
      // File exists - watch the file directly
      try {
        const fd = openSync(filePath, 'r');
        const stats = fstatSync(fd);
        lastSize = stats.size;
        closeSync(fd);
      } catch {
        // Start from 0 if can't read
      }

      watcher = watch(filePath, { persistent: false }, (eventType) => {
        if (eventType === 'change') {
          handleFileChange(loopId, filePath);
        }
      });

      watcher.on('error', (error) => {
        console.error(`Watcher error for ${loopId}:`, error);
      });

      console.log(`Started file watcher for loop: ${loopId}`);
    } else {
      // File doesn't exist yet - watch the parent directory for file creation
      const dirPath = dirname(filePath);

      if (existsSync(dirPath)) {
        watchingDirectory = true;
        watcher = watch(
          dirPath,
          { persistent: false },
          (eventType, filename) => {
            if (eventType === 'rename') {
              handleDirectoryChange(
                loopId,
                filePath,
                filename as string | null
              );
            }
          }
        );

        watcher.on('error', (error) => {
          console.error(`Directory watcher error for ${loopId}:`, error);
        });

        console.log(
          `Started directory watcher for loop: ${loopId} (file not yet created)`
        );
      } else {
        console.log(
          `Cannot watch loop ${loopId}: transcript directory does not exist`
        );
      }
    }

    state = {
      watcher,
      lastSize,
      debounceTimer: null,
      clients: new Set(),
      watchingDirectory,
    };

    watchers.set(loopId, state);
  }

  state.clients.add(client);
  console.log(
    `Client subscribed to loop ${loopId} (${state.clients.size} clients)`
  );

  return { success: true };
}

/**
 * Unsubscribe a client from a loopId.
 * Stops the watcher if no more clients are subscribed.
 */
export function unsubscribeFromLoop(
  loopId: string,
  client: ServerWebSocket<WebSocketData>
): void {
  const state = watchers.get(loopId);
  if (!state) return;

  state.clients.delete(client);
  console.log(
    `Client unsubscribed from loop ${loopId} (${state.clients.size} clients)`
  );

  // Clean up watcher if no more clients
  if (state.clients.size === 0) {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }
    if (state.watcher) {
      state.watcher.close();
    }
    watchers.delete(loopId);
    console.log(`Stopped watching transcript for loop: ${loopId}`);
  }
}

/**
 * Unsubscribe a client from all loops they're subscribed to.
 */
export function unsubscribeFromAll(
  client: ServerWebSocket<WebSocketData>
): void {
  for (const [loopId, state] of watchers) {
    if (state.clients.has(client)) {
      unsubscribeFromLoop(loopId, client);
    }
  }
}

/**
 * Get the number of active watchers (for debugging/monitoring).
 */
export function getActiveWatcherCount(): number {
  return watchers.size;
}

/**
 * Clean up all watchers (for graceful shutdown).
 */
export function cleanupAllWatchers(): void {
  for (const state of watchers.values()) {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }
    if (state.watcher) {
      state.watcher.close();
    }
  }
  watchers.clear();
  console.log('All transcript watchers cleaned up');
}
