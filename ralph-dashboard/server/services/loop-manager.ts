import { existsSync, unlinkSync } from 'fs';
import type { Session } from '../types';

export interface CancelResult {
  success: boolean;
  message: string;
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
      message: `No state file path found for session ${session.session_id}`,
    };
  }

  if (!existsSync(stateFilePath)) {
    return {
      success: false,
      message: `State file not found: ${stateFilePath}`,
    };
  }

  try {
    unlinkSync(stateFilePath);
    return {
      success: true,
      message: `Successfully cancelled loop ${session.session_id}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to delete state file: ${errorMessage}`,
    };
  }
}

export function checkStateFileExists(session: Session): boolean {
  if (!session.state_file_path) {
    return false;
  }
  return existsSync(session.state_file_path);
}
