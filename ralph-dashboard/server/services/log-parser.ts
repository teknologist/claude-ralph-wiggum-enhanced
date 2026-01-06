import { homedir } from 'os';
import { join } from 'path';
import {
  readFileSync,
  existsSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'fs';
import type {
  LogEntry,
  StartLogEntry,
  CompletionLogEntry,
  Session,
} from '../types';
import { getChecklistWithProgress } from './checklist-service.js';
import { findFileByLoopId } from './file-finder.js';

// Global paths
const RALPH_BASE_DIR = join(homedir(), '.claude', 'ralph-wiggum-pro');
const LOGS_DIR = join(RALPH_BASE_DIR, 'logs');
const LOG_FILE = join(LOGS_DIR, 'sessions.jsonl');

// Rotation constants
const MAX_SESSION_ENTRIES = 100;

// Old path for backward compatibility (read-only, for migration)
const OLD_LOG_FILE = join(
  homedir(),
  '.claude',
  'ralph-wiggum-pro-logs',
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
  // Note: 'active' field removed in new architecture - check for session_id instead
  if (!frontmatter.includes('session_id:')) {
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

/**
 * Parse entries from a single log file.
 */
function parseEntriesFromFile(filePath: string): LogEntry[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
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

export function parseLogFile(): LogEntry[] {
  // Merge entries from both new and old log files for backward compatibility
  const newEntries = parseEntriesFromFile(LOG_FILE);
  const oldEntries = parseEntriesFromFile(OLD_LOG_FILE);

  // Combine entries (old entries first for chronological order)
  return [...oldEntries, ...newEntries];
}

export function mergeSessions(entries: LogEntry[]): Session[] {
  // Group entries by loop_id (primary key)
  // Fallback to session_id for backward compatibility with old entries
  const loopMap = new Map<
    string,
    { start?: StartLogEntry; completion?: CompletionLogEntry }
  >();

  for (const entry of entries) {
    // Use loop_id if available, otherwise fall back to session_id (backward compat)
    const loopId =
      (entry as StartLogEntry).loop_id ||
      (entry as CompletionLogEntry).loop_id ||
      entry.session_id;
    const existing = loopMap.get(loopId) || {};

    if (entry.status === 'active') {
      existing.start = entry as StartLogEntry;
    } else if (entry.status === 'completed') {
      existing.completion = entry as CompletionLogEntry;
    }

    loopMap.set(loopId, existing);
  }

  // Merge into Session objects
  const sessions: Session[] = [];

  for (const [loop_id, { start, completion }] of loopMap) {
    // Handle orphaned completions (no start entry - likely purged by old rotation)
    if (!start && completion) {
      sessions.push({
        loop_id,
        session_id: completion.session_id,
        status: 'orphaned',
        outcome: completion.outcome,
        project: '',
        project_name: '(orphaned entry)',
        state_file_path: undefined,
        task: `Orphaned: ${completion.outcome}`,
        started_at: completion.ended_at, // Use end time as approximation
        ended_at: completion.ended_at,
        duration_seconds: completion.duration_seconds ?? 0,
        iterations: completion.iterations ?? null,
        max_iterations: 0,
        completion_promise: null,
        error_reason: completion.error_reason ?? null,
        has_checklist: false,
        checklist_progress: null,
      });
      continue;
    }

    if (!start) {
      // Skip if neither start nor completion (shouldn't happen)
      continue;
    }

    // A loop is active if:
    // 1. There's no completion entry, OR
    // 2. The start entry is more recent than the completion entry (backward compat for old session_id-based entries)
    const startTime = new Date(start.started_at);
    const completionTime = completion?.ended_at
      ? new Date(completion.ended_at)
      : null;
    const isActive =
      !completion || (completionTime && startTime > completionTime);
    const now = new Date();

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

    // Detect orphaned sessions (marked active but state file doesn't exist)
    if (status === 'active' && start.state_file_path) {
      if (!existsSync(start.state_file_path)) {
        status = 'orphaned';
      }
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

    // Get checklist data if available
    let hasChecklist = false;
    let checklistProgress: string | null = null;
    try {
      const checklistResult = getChecklistWithProgress(loop_id);
      if (checklistResult.checklist) {
        hasChecklist = true;
        checklistProgress = checklistResult.progress?.criteria ?? null;
      }
    } catch {
      // Ignore errors reading checklist
    }

    sessions.push({
      loop_id,
      session_id: start.session_id,
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
      has_checklist: hasChecklist,
      checklist_progress: checklistProgress,
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

export function getSessionById(loopId: string): Session | null {
  const sessions = getSessions();
  return sessions.find((s) => s.loop_id === loopId) ?? null;
}

/**
 * Delete transcript files for a loop.
 * Removes iterations.jsonl, full.jsonl, and checklist.json files.
 * Tries both loop_id and session_id to handle different naming formats.
 */
function deleteTranscriptFiles(loopId: string, sessionId?: string): void {
  const suffixes = ['iterations.jsonl', 'full.jsonl', 'checklist.json'];

  // Try deleting by loop_id
  for (const suffix of suffixes) {
    const filePath = findFileByLoopId(loopId, suffix);
    if (filePath && existsSync(filePath)) {
      try {
        unlinkSync(filePath);
      } catch {
        // Ignore errors - file may already be gone
      }
    }
  }

  // Also try deleting by session_id for older format files
  if (sessionId && sessionId !== loopId) {
    for (const suffix of suffixes) {
      const filePath = findFileByLoopId(sessionId, suffix);
      if (filePath && existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch {
          // Ignore errors - file may already be gone
        }
      }
    }
  }
}

/**
 * Permanently delete a loop from the log file.
 * Removes both start and completion entries for the given loop_id.
 * Also deletes the state file and transcript files if they exist.
 * Returns true if loop was found and deleted, false otherwise.
 */
export function deleteSession(loopId: string): boolean {
  // Get session info first to find state file path
  const session = getSessionById(loopId);

  // Delete state file if it exists (stops any active loop)
  if (session?.state_file_path && existsSync(session.state_file_path)) {
    try {
      unlinkSync(session.state_file_path);
    } catch {
      // Ignore errors - file may already be gone
    }
  }

  // Delete transcript files (iterations, full transcript, checklist)
  // Pass session_id to handle older naming formats
  deleteTranscriptFiles(loopId, session?.session_id);

  if (!existsSync(LOG_FILE)) {
    return false;
  }

  const content = readFileSync(LOG_FILE, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());

  // Filter out all entries for this loop
  const filteredLines: string[] = [];
  let found = false;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as LogEntry;
      // Match by loop_id, with fallback to session_id for backward compatibility
      const entryLoopId =
        (entry as StartLogEntry).loop_id ||
        (entry as CompletionLogEntry).loop_id ||
        entry.session_id;
      if (entryLoopId === loopId) {
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

/**
 * Result of a rotation operation.
 */
export interface RotationResult {
  success: boolean;
  entriesBefore: number;
  entriesAfter: number;
  sessionsPurged: number;
  error?: string;
}

/**
 * Rotate session log by removing oldest COMPLETE sessions.
 *
 * SAFETY GUARANTEES:
 * 1. Backup created before any modification
 * 2. Only purges COMPLETE sessions (both start + completion exist)
 * 3. Never removes more than 50% of entries in one rotation
 * 4. Validates entry counts match expectations before replacing
 * 5. Validates output file structure
 * 6. Restores backup if ANY step fails
 * 7. Never deletes incomplete sessions (would create orphans)
 * 8. Uses atomic temp file + rename for final write
 */
export function rotateSessionLog(): RotationResult {
  // GUARD: File must exist
  if (!existsSync(LOG_FILE)) {
    return {
      success: true,
      entriesBefore: 0,
      entriesAfter: 0,
      sessionsPurged: 0,
    };
  }

  const content = readFileSync(LOG_FILE, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());
  const entryCount = lines.length;

  // GUARD: Only rotate if over limit
  if (entryCount <= MAX_SESSION_ENTRIES) {
    return {
      success: true,
      entriesBefore: entryCount,
      entriesAfter: entryCount,
      sessionsPurged: 0,
    };
  }

  // SAFETY: Create backup before any modifications
  const backupFile = LOG_FILE + '.rotation-backup';
  try {
    writeFileSync(backupFile, content);
  } catch {
    return {
      success: false,
      entriesBefore: entryCount,
      entriesAfter: entryCount,
      sessionsPurged: 0,
      error: 'Failed to create backup',
    };
  }

  try {
    // Parse all entries
    const entries: LogEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as LogEntry);
      } catch {
        // Keep malformed entries (don't delete what we can't parse)
        continue;
      }
    }

    // Group by loop_id
    const byLoopId = new Map<
      string,
      { start?: StartLogEntry; completion?: CompletionLogEntry }
    >();
    for (const entry of entries) {
      const loopId =
        (entry as StartLogEntry).loop_id ||
        (entry as CompletionLogEntry).loop_id ||
        entry.session_id;
      const existing = byLoopId.get(loopId) || {};

      if (entry.status === 'active') {
        existing.start = entry as StartLogEntry;
      } else if (entry.status === 'completed') {
        existing.completion = entry as CompletionLogEntry;
      }
      byLoopId.set(loopId, existing);
    }

    // Find COMPLETE sessions only (have BOTH start AND completion)
    // Sort by started_at ascending (oldest first)
    const completeSessions = Array.from(byLoopId.entries())
      .filter(([, data]) => data.start && data.completion)
      .map(([loopId, data]) => ({
        loopId,
        startedAt: data.start!.started_at,
      }))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

    // GUARD: No complete sessions to purge
    if (completeSessions.length === 0) {
      unlinkSync(backupFile);
      return {
        success: true,
        entriesBefore: entryCount,
        entriesAfter: entryCount,
        sessionsPurged: 0,
      };
    }

    // Calculate how many entries to remove
    let entriesToRemove = entryCount - MAX_SESSION_ENTRIES;

    // SAFETY: Never remove more than 50% in one rotation
    const maxRemove = Math.floor(entryCount / 2);
    if (entriesToRemove > maxRemove) {
      entriesToRemove = maxRemove;
    }

    // Build set of loop_ids to purge (oldest first, respecting limit)
    const purgeIds = new Set<string>();
    let purgeCount = 0;

    for (const session of completeSessions) {
      const loopEntries = entries.filter((e) => {
        const id =
          (e as StartLogEntry).loop_id ||
          (e as CompletionLogEntry).loop_id ||
          e.session_id;
        return id === session.loopId;
      });

      // SAFETY: Complete session should have exactly 2 entries (start + completion)
      if (loopEntries.length !== 2) {
        continue; // Skip anomalies
      }

      purgeIds.add(session.loopId);
      purgeCount += loopEntries.length;

      if (purgeCount >= entriesToRemove) {
        break;
      }
    }

    // GUARD: Nothing to purge
    if (purgeIds.size === 0) {
      unlinkSync(backupFile);
      return {
        success: true,
        entriesBefore: entryCount,
        entriesAfter: entryCount,
        sessionsPurged: 0,
      };
    }

    // Filter out purged entries (keep original lines to preserve formatting)
    const filteredLines: string[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as LogEntry;
        const loopId =
          (entry as StartLogEntry).loop_id ||
          (entry as CompletionLogEntry).loop_id ||
          entry.session_id;
        if (!purgeIds.has(loopId)) {
          filteredLines.push(line);
        }
      } catch {
        // SAFETY: Keep malformed lines (don't delete what we can't parse)
        filteredLines.push(line);
      }
    }

    // SAFETY VALIDATION: Check counts match expectations
    const expectedCount = entryCount - purgeCount;
    if (filteredLines.length !== expectedCount) {
      // Counts don't match - abort, restore backup
      writeFileSync(LOG_FILE, content);
      unlinkSync(backupFile);
      return {
        success: false,
        entriesBefore: entryCount,
        entriesAfter: entryCount,
        sessionsPurged: 0,
        error: `Count mismatch: expected ${expectedCount}, got ${filteredLines.length}`,
      };
    }

    // SAFETY: New file must have content (we never delete everything)
    if (filteredLines.length === 0) {
      writeFileSync(LOG_FILE, content);
      unlinkSync(backupFile);
      return {
        success: false,
        entriesBefore: entryCount,
        entriesAfter: entryCount,
        sessionsPurged: 0,
        error: 'Rotation would delete all entries',
      };
    }

    // SAFETY: Validate each remaining line is valid JSON
    for (const line of filteredLines) {
      try {
        JSON.parse(line);
      } catch {
        // This shouldn't happen since we kept the original lines, but check anyway
        writeFileSync(LOG_FILE, content);
        unlinkSync(backupFile);
        return {
          success: false,
          entriesBefore: entryCount,
          entriesAfter: entryCount,
          sessionsPurged: 0,
          error: 'Invalid JSON in filtered output',
        };
      }
    }

    // All checks passed - atomic write using temp file + rename
    const tempFile = LOG_FILE + '.tmp.' + Date.now();
    writeFileSync(tempFile, filteredLines.join('\n') + '\n');
    renameSync(tempFile, LOG_FILE);

    // Success - remove backup
    unlinkSync(backupFile);

    // Clean up transcripts for purged loops (non-critical)
    for (const loopId of purgeIds) {
      deleteTranscriptFiles(loopId);
    }

    return {
      success: true,
      entriesBefore: entryCount,
      entriesAfter: filteredLines.length,
      sessionsPurged: purgeIds.size,
    };
  } catch (err) {
    // SAFETY: Any error - restore from backup
    try {
      const backup = readFileSync(backupFile, 'utf-8');
      writeFileSync(LOG_FILE, backup);
      unlinkSync(backupFile);
    } catch {
      // Backup restore failed - leave backup in place for manual recovery
    }
    return {
      success: false,
      entriesBefore: entryCount,
      entriesAfter: entryCount,
      sessionsPurged: 0,
      error: String(err),
    };
  }
}

/**
 * Delete all archived sessions (not active).
 * Includes orphaned sessions so they can be cleaned up.
 * Removes log entries, state files, and transcript files.
 * Uses batch operations to avoid O(n^2) file I/O.
 * Returns the count of deleted sessions.
 */
export function deleteAllArchivedSessions(): number {
  const sessions = getSessions();

  // Filter to archived only (includes orphaned so they can be cleaned up)
  const archivedSessions = sessions.filter((s) => s.status !== 'active');

  if (archivedSessions.length === 0) {
    return 0;
  }

  const loopIdsToDelete = new Set(archivedSessions.map((s) => s.loop_id));

  // Delete state files and transcripts in one pass
  for (const session of archivedSessions) {
    // Delete state file if exists
    if (session.state_file_path && existsSync(session.state_file_path)) {
      try {
        unlinkSync(session.state_file_path);
      } catch {
        // Ignore errors - file may already be gone
      }
    }
    // Delete transcript files
    deleteTranscriptFiles(session.loop_id, session.session_id);
  }

  // Single pass through log file to remove all matching entries
  if (!existsSync(LOG_FILE)) {
    return archivedSessions.length;
  }

  const content = readFileSync(LOG_FILE, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());

  const filteredLines = lines.filter((line) => {
    try {
      const entry = JSON.parse(line) as LogEntry;
      const entryLoopId =
        (entry as StartLogEntry).loop_id ||
        (entry as CompletionLogEntry).loop_id ||
        entry.session_id;
      return !loopIdsToDelete.has(entryLoopId);
    } catch {
      return true; // Keep malformed lines
    }
  });

  // Write atomically using temp file + rename
  const tempFile = LOG_FILE + '.tmp.' + Date.now();
  writeFileSync(
    tempFile,
    filteredLines.join('\n') + (filteredLines.length > 0 ? '\n' : '')
  );
  renameSync(tempFile, LOG_FILE);

  return archivedSessions.length;
}
