import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync, readdirSync } from 'fs';
import type {
  Checklist,
  ChecklistItem,
  ChecklistProgress,
  ChecklistItemStatus,
} from '../types.js';

// Global paths
const RALPH_BASE_DIR = join(homedir(), '.claude', 'ralph-wiggum-pro');
const TRANSCRIPTS_DIR = join(RALPH_BASE_DIR, 'transcripts');

// Old path for backward compatibility
const OLD_TRANSCRIPTS_DIR = join(
  homedir(),
  '.claude',
  'ralph-wiggum-pro-logs',
  'transcripts'
);

/**
 * Validate loop_id format to prevent path traversal attacks
 */
function validateLoopId(loopId: string): boolean {
  // Only allow safe characters: letters, numbers, dots, dashes, underscores
  // Max length of 256 characters
  const safePattern = /^[a-zA-Z0-9._-]{1,256}$/;
  if (!safePattern.test(loopId)) {
    return false;
  }
  // Prevent path traversal with ..
  if (loopId.includes('..')) {
    return false;
  }
  return true;
}

/**
 * Find the checklist file path for a loop.
 * Handles both new naming ({session_id}-{loop_id}-checklist.json) and
 * old naming ({loop_id}-checklist.json).
 */
function getChecklistPath(loopId: string): string | null {
  if (!validateLoopId(loopId)) {
    throw new Error(`Invalid loop_id format: ${loopId}`);
  }

  // Try new directory with glob pattern
  if (existsSync(TRANSCRIPTS_DIR)) {
    const files = readdirSync(TRANSCRIPTS_DIR);
    const match = files.find(
      (f) =>
        f.endsWith(`-${loopId}-checklist.json`) ||
        f === `${loopId}-checklist.json`
    );
    if (match) {
      return join(TRANSCRIPTS_DIR, match);
    }
  }

  // Try old directory (backward compatibility)
  if (existsSync(OLD_TRANSCRIPTS_DIR)) {
    const files = readdirSync(OLD_TRANSCRIPTS_DIR);
    const match = files.find(
      (f) =>
        f.endsWith(`-${loopId}-checklist.json`) ||
        f === `${loopId}-checklist.json`
    );
    if (match) {
      return join(OLD_TRANSCRIPTS_DIR, match);
    }
  }

  return null;
}

/**
 * Check if checklist file exists for a loop
 */
export function hasChecklist(loopId: string): boolean {
  try {
    const path = getChecklistPath(loopId);
    return path !== null && existsSync(path);
  } catch {
    return false;
  }
}

/**
 * Read and parse a checklist file
 */
export function getChecklist(loopId: string): Checklist | null {
  try {
    const path = getChecklistPath(loopId);

    if (!path || !existsSync(path)) {
      return null;
    }

    const content = readFileSync(path, 'utf-8');
    const checklist = JSON.parse(content) as Checklist;

    // Validate structure
    if (
      !checklist.loop_id ||
      !checklist.task_checklist ||
      !checklist.completion_criteria
    ) {
      return null;
    }

    return checklist;
  } catch {
    // File doesn't exist or is invalid JSON
    return null;
  }
}

/**
 * Calculate progress summary from a checklist
 */
export function getChecklistProgress(checklist: Checklist): ChecklistProgress {
  const tasksTotal = checklist.task_checklist.length;
  const tasksCompleted = checklist.task_checklist.filter(
    (item) => item.status === 'completed'
  ).length;

  const criteriaTotal = checklist.completion_criteria.length;
  const criteriaCompleted = checklist.completion_criteria.filter(
    (item) => item.status === 'completed'
  ).length;

  return {
    tasks: `${tasksCompleted}/${tasksTotal} tasks`,
    criteria: `${criteriaCompleted}/${criteriaTotal} criteria`,
    tasksCompleted,
    tasksTotal,
    criteriaCompleted,
    criteriaTotal,
  };
}

/**
 * Get checklist with progress for a loop
 */
export function getChecklistWithProgress(loopId: string): {
  checklist: Checklist | null;
  progress: ChecklistProgress | null;
} {
  const checklist = getChecklist(loopId);

  if (!checklist) {
    return { checklist: null, progress: null };
  }

  const progress = getChecklistProgress(checklist);

  return { checklist, progress };
}

/**
 * Validate checklist item status
 */
export function isValidChecklistStatus(
  status: string
): status is ChecklistItemStatus {
  return ['pending', 'in_progress', 'completed'].includes(status);
}

/**
 * Validate checklist item structure
 */
export function isValidChecklistItem(item: unknown): item is ChecklistItem {
  if (typeof item !== 'object' || item === null) {
    return false;
  }

  const check = item as Record<string, unknown>;

  return (
    typeof check.id === 'string' &&
    typeof check.text === 'string' &&
    isValidChecklistStatus(check.status as string) &&
    typeof check.created_at === 'string' &&
    (check.completed_at === null ||
      check.completed_at === undefined ||
      typeof check.completed_at === 'string') &&
    (check.completed_iteration === null ||
      check.completed_iteration === undefined ||
      typeof check.completed_iteration === 'number')
  );
}

/**
 * Validate checklist structure
 */
export function isValidChecklist(data: unknown): data is Checklist {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const check = data as Record<string, unknown>;

  return (
    typeof check.loop_id === 'string' &&
    typeof check.session_id === 'string' &&
    typeof check.project === 'string' &&
    typeof check.project_name === 'string' &&
    typeof check.created_at === 'string' &&
    typeof check.updated_at === 'string' &&
    Array.isArray(check.task_checklist) &&
    check.task_checklist.every(isValidChecklistItem) &&
    Array.isArray(check.completion_criteria) &&
    check.completion_criteria.every(isValidChecklistItem)
  );
}
