import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
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

export function getLogFilePath(): string {
  return LOG_FILE;
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

    sessions.push({
      session_id,
      status,
      outcome: completion?.outcome,
      project: start.project,
      project_name: start.project_name,
      state_file_path: start.state_file_path,
      task: start.task,
      started_at: start.started_at,
      ended_at: completion?.ended_at ?? null,
      duration_seconds: durationSeconds,
      iterations: completion?.iterations ?? null,
      max_iterations: start.max_iterations,
      completion_promise: start.completion_promise,
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
