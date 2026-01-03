import { getSessionById } from '../services/log-parser';
import { cancelLoop } from '../services/loop-manager';
import type { CancelResponse, ErrorResponse } from '../types';

export function handleCancelSession(sessionId: string): Response {
  try {
    const session = getSessionById(sessionId);

    if (!session) {
      const response: ErrorResponse = {
        error: 'NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      };
      return Response.json(response, { status: 404 });
    }

    if (session.status !== 'active') {
      const response: ErrorResponse = {
        error: 'INVALID_STATE',
        message: `Cannot cancel session: status is '${session.status}', expected 'active'`,
      };
      return Response.json(response, { status: 400 });
    }

    const result = cancelLoop(session);

    if (!result.success) {
      const response: ErrorResponse = {
        error: 'CANCEL_FAILED',
        message: result.message,
      };
      return Response.json(response, { status: 500 });
    }

    const response: CancelResponse = {
      success: true,
      message: result.message,
      session_id: sessionId,
    };

    return Response.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const response: ErrorResponse = {
      error: 'CANCEL_ERROR',
      message: `Failed to cancel session: ${errorMessage}`,
    };
    return Response.json(response, { status: 500 });
  }
}
