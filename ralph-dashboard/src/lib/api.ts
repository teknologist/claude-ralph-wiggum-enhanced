import type {
  Session,
  SessionsResponse,
  CancelResponse,
  ErrorResponse,
} from '../../server/types';

const API_BASE = '/api';

export async function fetchSessions(): Promise<SessionsResponse> {
  const response = await fetch(`${API_BASE}/sessions`);
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  return response.json();
}

export async function fetchSession(sessionId: string): Promise<Session> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}`);
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  return response.json();
}

export async function cancelSession(
  sessionId: string
): Promise<CancelResponse> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/cancel`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  return response.json();
}
