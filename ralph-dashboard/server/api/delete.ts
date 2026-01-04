import { getSessionById, deleteSession } from '../services/log-parser';
import type { DeleteResponse, ErrorResponse } from '../types';

export function handleDeleteSession(sessionId: string): Response {
  try {
    const session = getSessionById(sessionId);

    if (!session) {
      const response: ErrorResponse = {
        error: 'NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      };
      return Response.json(response, { status: 404 });
    }

    // Only allow deletion of non-active sessions
    if (session.status === 'active') {
      const response: ErrorResponse = {
        error: 'INVALID_STATE',
        message: `Cannot delete active session. Cancel it first.`,
      };
      return Response.json(response, { status: 400 });
    }

    const deleted = deleteSession(sessionId);

    if (!deleted) {
      const response: ErrorResponse = {
        error: 'DELETE_FAILED',
        message: `Failed to delete session from log file`,
      };
      return Response.json(response, { status: 500 });
    }

    const response: DeleteResponse = {
      success: true,
      message: `Session permanently deleted from history`,
      session_id: sessionId,
    };

    return Response.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const response: ErrorResponse = {
      error: 'DELETE_ERROR',
      message: `Failed to delete session: ${errorMessage}`,
    };
    return Response.json(response, { status: 500 });
  }
}
