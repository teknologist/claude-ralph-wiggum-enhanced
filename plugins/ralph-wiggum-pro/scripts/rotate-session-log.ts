#!/usr/bin/env bun
/**
 * Self-contained session log rotation script.
 *
 * Called from log-session.sh to safely purge old complete sessions.
 * This script is self-contained (no imports from ralph-dashboard) so it
 * works correctly when the plugin is cached by Claude Code.
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

import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  rmSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Constants
const RALPH_BASE_DIR = join(homedir(), '.claude', 'ralph-wiggum-pro');
const LOGS_DIR = join(RALPH_BASE_DIR, 'logs');
const LOG_FILE = join(LOGS_DIR, 'sessions.jsonl');
const TRANSCRIPTS_DIR = join(RALPH_BASE_DIR, 'transcripts');
const MAX_SESSION_ENTRIES = 100;

// Types
interface LogEntry {
  session_id: string;
  status: 'active' | 'completed';
}

interface StartLogEntry extends LogEntry {
  status: 'active';
  loop_id: string;
  started_at: string;
}

interface CompletionLogEntry extends LogEntry {
  status: 'completed';
  loop_id: string;
}

interface RotationResult {
  success: boolean;
  entriesBefore: number;
  entriesAfter: number;
  sessionsPurged: number;
  error?: string;
}

/**
 * Delete transcript files for a given loop ID.
 */
function deleteTranscriptFiles(loopId: string): void {
  if (!loopId || typeof loopId !== 'string') return;

  // Validate loop_id format (alphanumeric, reasonable length)
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(loopId)) return;

  try {
    const iterationsFile = join(TRANSCRIPTS_DIR, `${loopId}_iterations.jsonl`);
    const fullFile = join(TRANSCRIPTS_DIR, `${loopId}_full.txt`);

    if (existsSync(iterationsFile)) {
      rmSync(iterationsFile, { force: true });
    }
    if (existsSync(fullFile)) {
      rmSync(fullFile, { force: true });
    }
  } catch {
    // Non-critical - ignore transcript cleanup errors
  }
}

/**
 * Rotate session log by removing oldest COMPLETE sessions.
 */
function rotateSessionLog(): RotationResult {
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

// Main execution
const result = rotateSessionLog();

if (result.success) {
  if (result.sessionsPurged > 0) {
    console.log(
      `Rotated: ${result.entriesBefore} → ${result.entriesAfter} entries (${result.sessionsPurged} sessions purged)`
    );
  }
  process.exit(0);
} else {
  console.error(`Rotation failed: ${result.error}`);
  process.exit(1);
}
