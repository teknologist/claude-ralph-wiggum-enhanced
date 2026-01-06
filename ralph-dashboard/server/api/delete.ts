import {
  getSessionById,
  deleteSession,
  deleteAllArchivedSessions,
} from '../services/log-parser';
import type {
  DeleteResponse,
  DeleteAllResponse,
  ErrorResponse,
} from '../types';

export function handleDeleteSession(loopId: string): Response {
  try {
    const session = getSessionById(loopId);

    if (!session) {
      const response: ErrorResponse = {
        error: 'NOT_FOUND',
        message: `Loop not found: ${loopId}`,
      };
      return Response.json(response, { status: 404 });
    }

    // Only allow deletion of non-active sessions
    if (session.status === 'active') {
      const response: ErrorResponse = {
        error: 'INVALID_STATE',
        message: `Cannot delete active loop. Cancel it first.`,
      };
      return Response.json(response, { status: 400 });
    }

    const deleted = deleteSession(loopId);

    if (!deleted) {
      const response: ErrorResponse = {
        error: 'DELETE_FAILED',
        message: `Failed to delete loop from log file`,
      };
      return Response.json(response, { status: 500 });
    }

    const response: DeleteResponse = {
      success: true,
      message: `Loop permanently deleted from history`,
      loop_id: loopId,
    };

    return Response.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const response: ErrorResponse = {
      error: 'DELETE_ERROR',
      message: `Failed to delete loop: ${errorMessage}`,
    };
    return Response.json(response, { status: 500 });
  }
}

export function handleDeleteAllArchivedSessions(): Response {
  try {
    const deletedCount = deleteAllArchivedSessions();

    const response: DeleteAllResponse = {
      success: true,
      deleted_count: deletedCount,
      message: `Permanently deleted ${deletedCount} archived session(s) and their transcripts`,
    };
    return Response.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const response: ErrorResponse = {
      error: 'DELETE_ERROR',
      message: `Failed to delete archived sessions: ${errorMessage}`,
    };
    return Response.json(response, { status: 500 });
  }
}
