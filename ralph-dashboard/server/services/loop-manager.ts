import { existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import type { Session } from '../types';

export interface CancelResult {
  success: boolean;
  message: string;
}

/**
 * Validate that the state file path is within the expected project directory.
 * This prevents deletion of files outside the project's .claude directory.
 */
function validateStateFilePath(
  stateFilePath: string,
  session: Session
): boolean {
  if (!session.project) {
    return false;
  }

  try {
    const resolvedPath = resolve(stateFilePath);
    const expectedBase = resolve(session.project, '.claude');

    // Ensure the state file is within the project's .claude directory
    return resolvedPath.startsWith(expectedBase);
  } catch {
    return false;
  }
}

export function cancelLoop(session: Session): CancelResult {
  if (session.status !== 'active') {
    return {
      success: false,
      message: `Session ${session.session_id} is not active (status: ${session.status})`,
    };
  }

  const stateFilePath = session.state_file_path;

  if (!stateFilePath) {
    return {
      success: false,
      message: `No state file found for session ${session.session_id}`,
    };
  }

  // Validate the state file path is within expected bounds
  if (!validateStateFilePath(stateFilePath, session)) {
    return {
      success: false,
      message: `Invalid state file path for session ${session.session_id}`,
    };
  }

  if (!existsSync(stateFilePath)) {
    return {
      success: false,
      message: `State file no longer exists for session ${session.session_id}`,
    };
  }

  try {
    unlinkSync(stateFilePath);
    return {
      success: true,
      message: `Successfully cancelled loop ${session.session_id}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to cancel loop ${session.session_id}`,
    };
  }
}

export function checkStateFileExists(session: Session): boolean {
  if (!session.state_file_path) {
    return false;
  }
  return existsSync(session.state_file_path);
}
