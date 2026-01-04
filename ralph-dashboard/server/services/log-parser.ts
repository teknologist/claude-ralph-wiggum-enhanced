import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync, writeFileSync, renameSync } from 'fs';
import type {
  LogEntry,
  StartLogEntry,
  CompletionLogEntry,
  Session,
} from '../types';

const LOG_FILE = join(
  homedir(),
  '.claude',
  'ralph-wiggum-logs',
  'sessions.jsonl'
);

/**
 * Extract --completion-promise=XXX from task text.
 * Returns { task: string (cleaned), completionPromise: string | null }
 */
function extractCompletionPromiseFromTask(task: string | undefined): {
  task: string | undefined;
  completionPromise: string | null;
} {
  if (!task) {
    return { task, completionPromise: null };
  }

  // Match --completion-promise=VALUE (with or without quotes)
  // Handles: --completion-promise=COMPLETE, --completion-promise="COMPLETE", --completion-promise='COMPLETE'
  const match = task.match(/--completion-promise=["']?([^"'\s]+)["']?/);

  if (!match) {
    return { task, completionPromise: null };
  }

  const completionPromise = match[1];
  // Remove the --completion-promise=XXX from task, trim extra whitespace
  const cleanedTask = task
    .replace(/\s*--completion-promise=["']?[^"'\s]+["']?\s*/g, ' ')
    .trim();

  return { task: cleanedTask, completionPromise };
}

export function getLogFilePath(): string {
  return LOG_FILE;
}

/**
 * Parse iteration from file content.
 * Returns null if content is malformed or incomplete.
 */
function parseIterationFromContent(content: string): number | null {
  // Validate complete YAML frontmatter structure
  // Must start with --- and have closing ---
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  const frontmatter = frontmatterMatch[1];

  // Validate frontmatter has required fields (indicates complete write)
  if (
    !frontmatter.includes('active:') ||
    !frontmatter.includes('session_id:')
  ) {
    return null; // Incomplete/corrupted frontmatter
  }

  const iterationMatch = frontmatter.match(/^iteration:\s*(\d+)/m);
  if (!iterationMatch) {
    return null;
  }

  return parseInt(iterationMatch[1], 10);
}

/**
 * Read current iteration from state file for active sessions.
 * State file has YAML frontmatter with iteration field.
 * Uses retry with validation to handle potential race conditions
 * when the stop hook is writing to the file simultaneously.
 */
export function readIterationFromStateFile(
  stateFilePath: string,
  maxRetries = 2
): number | null {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (!existsSync(stateFilePath)) {
        return null;
      }

      const content = readFileSync(stateFilePath, 'utf-8');
      const iteration = parseIterationFromContent(content);

      if (iteration !== null) {
        return iteration;
      }

      // Content was malformed, wait briefly and retry
      if (attempt < maxRetries - 1) {
        // Small delay before retry (10ms) to let write complete
        const start = Date.now();
        while (Date.now() - start < 10) {
          // Busy wait - Bun doesn't have sync sleep
        }
      }
    } catch {
      // File read error, try again
      if (attempt < maxRetries - 1) {
        continue;
      }
      return null;
    }
  }

  return null;
}

export function parseLogFile(): LogEntry[] {
  if (!existsSync(LOG_FILE)) {
    return [];
  }

  const content = readFileSync(LOG_FILE, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());

  const entries: LogEntry[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as LogEntry;
      entries.push(entry);
    } catch {
      // Skip malformed lines
      console.warn('Skipping malformed log entry:', line.slice(0, 50));
    }
  }

  return entries;
}

export function mergeSessions(entries: LogEntry[]): Session[] {
  // Group entries by session_id
  const sessionMap = new Map<
    string,
    { start?: StartLogEntry; completion?: CompletionLogEntry }
  >();

  for (const entry of entries) {
    const existing = sessionMap.get(entry.session_id) || {};

    if (entry.status === 'active') {
      existing.start = entry as StartLogEntry;
    } else if (entry.status === 'completed') {
      existing.completion = entry as CompletionLogEntry;
    }

    sessionMap.set(entry.session_id, existing);
  }

  // Merge into Session objects
  const sessions: Session[] = [];

  for (const [session_id, { start, completion }] of sessionMap) {
    if (!start) {
      // Skip entries without a start record (shouldn't happen)
      continue;
    }

    const isActive = !completion;
    const now = new Date();
    const startTime = new Date(start.started_at);

    // Calculate duration for active sessions
    const durationSeconds = isActive
      ? Math.floor((now.getTime() - startTime.getTime()) / 1000)
      : (completion?.duration_seconds ?? 0);

    // Determine status
    let status: Session['status'];
    if (isActive) {
      status = 'active';
    } else if (completion) {
      status = completion.outcome;
    } else {
      status = 'active';
    }

    // For active sessions, read current iteration from state file
    let iterations: number | null = completion?.iterations ?? null;
    if (isActive && start.state_file_path) {
      iterations = readIterationFromStateFile(start.state_file_path);
    }

    // Extract completion promise from task if not explicitly set
    const { task: cleanedTask, completionPromise: extractedPromise } =
      extractCompletionPromiseFromTask(start.task);
    const completionPromise = start.completion_promise || extractedPromise;
    const task = cleanedTask ?? start.task;

    sessions.push({
      session_id,
      status,
      outcome: completion?.outcome,
      project: start.project,
      project_name: start.project_name,
      state_file_path: start.state_file_path,
      task,
      started_at: start.started_at,
      ended_at: completion?.ended_at ?? null,
      duration_seconds: durationSeconds,
      iterations,
      max_iterations: start.max_iterations,
      completion_promise: completionPromise,
      error_reason: completion?.error_reason ?? null,
    });
  }

  // Sort: active first, then by started_at descending
  sessions.sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
  });

  return sessions;
}

export function getSessions(): Session[] {
  const entries = parseLogFile();
  return mergeSessions(entries);
}

export function getSessionById(sessionId: string): Session | null {
  const sessions = getSessions();
  return sessions.find((s) => s.session_id === sessionId) ?? null;
}

/**
 * Permanently delete a session from the log file.
 * Removes both start and completion entries for the given session_id.
 * Returns true if session was found and deleted, false otherwise.
 */
export function deleteSession(sessionId: string): boolean {
  if (!existsSync(LOG_FILE)) {
    return false;
  }

  const content = readFileSync(LOG_FILE, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());

  // Filter out all entries for this session
  const filteredLines: string[] = [];
  let found = false;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (entry.session_id === sessionId) {
        found = true;
        // Skip this entry (delete it)
        continue;
      }
      filteredLines.push(line);
    } catch {
      // Keep malformed lines as-is
      filteredLines.push(line);
    }
  }

  if (!found) {
    return false;
  }

  // Write atomically using temp file + rename to prevent race conditions
  const tempFile = LOG_FILE + '.tmp.' + Date.now();
  writeFileSync(
    tempFile,
    filteredLines.join('\n') + (filteredLines.length > 0 ? '\n' : '')
  );

  // Atomic rename (safe on same filesystem)
  renameSync(tempFile, LOG_FILE);

  return true;
}
