import { getSessions, getSessionById } from '../services/log-parser';
import type { SessionsResponse, ErrorResponse } from '../types';

export function handleGetSessions(): Response {
  try {
    const sessions = getSessions();
    const activeCount = sessions.filter((s) => s.status === 'active').length;

    const response: SessionsResponse = {
      sessions,
      total: sessions.length,
      active_count: activeCount,
    };

    return Response.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const response: ErrorResponse = {
      error: 'FETCH_ERROR',
      message: `Failed to fetch sessions: ${errorMessage}`,
    };
    return Response.json(response, { status: 500 });
  }
}

export function handleGetSession(sessionId: string): Response {
  try {
    const session = getSessionById(sessionId);

    if (!session) {
      const response: ErrorResponse = {
        error: 'NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      };
      return Response.json(response, { status: 404 });
    }

    return Response.json(session);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const response: ErrorResponse = {
      error: 'FETCH_ERROR',
      message: `Failed to fetch session: ${errorMessage}`,
    };
    return Response.json(response, { status: 500 });
  }
}
