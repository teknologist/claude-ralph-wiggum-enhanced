import { existsSync, unlinkSync, appendFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import type { Session } from '../types';
import { getLogFilePath } from './log-parser';

export interface CancelResult {
  success: boolean;
  message: string;
}

// Global paths
const RALPH_BASE_DIR = join(homedir(), '.claude', 'ralph-wiggum-pro');
const LOOPS_DIR = join(RALPH_BASE_DIR, 'loops');

/**
 * Validate that the state file path is within the expected loops directory.
 * This prevents deletion of files outside the loops directory.
 */
function validateStateFilePath(stateFilePath: string): boolean {
  try {
    const resolvedPath = resolve(stateFilePath);
    const expectedBase = resolve(LOOPS_DIR);

    // Ensure the state file is within the global loops directory
    return resolvedPath.startsWith(expectedBase);
  } catch {
    return false;
  }
}

export function cancelLoop(session: Session): CancelResult {
  if (session.status !== 'active') {
    return {
      success: false,
      message: `Loop ${session.loop_id} is not active (status: ${session.status})`,
    };
  }

  const stateFilePath = session.state_file_path;

  if (!stateFilePath) {
    return {
      success: false,
      message: `No state file found for loop ${session.loop_id}`,
    };
  }

  // Validate the state file path is within expected bounds
  if (!validateStateFilePath(stateFilePath)) {
    return {
      success: false,
      message: `Invalid state file path for loop ${session.loop_id}`,
    };
  }

  if (!existsSync(stateFilePath)) {
    return {
      success: false,
      message: `State file no longer exists for loop ${session.loop_id}`,
    };
  }

  try {
    unlinkSync(stateFilePath);

    // Log the cancellation to sessions.jsonl
    const logEntry = {
      loop_id: session.loop_id,
      session_id: session.session_id,
      status: 'completed',
      outcome: 'cancelled',
      ended_at: new Date().toISOString(),
      duration_seconds: Math.floor(
        (Date.now() - new Date(session.started_at).getTime()) / 1000
      ),
      iterations: session.iterations ?? 0,
    };
    appendFileSync(getLogFilePath(), JSON.stringify(logEntry) + '\n');

    return {
      success: true,
      message: `Successfully cancelled loop ${session.loop_id}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to cancel loop ${session.loop_id}`,
    };
  }
}

export function checkStateFileExists(session: Session): boolean {
  if (!session.state_file_path) {
    return false;
  }
  return existsSync(session.state_file_path);
}
