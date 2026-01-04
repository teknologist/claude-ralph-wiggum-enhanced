import type {
  Session,
  SessionsResponse,
  CancelResponse,
  DeleteResponse,
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

export async function fetchSession(loopId: string): Promise<Session> {
  const response = await fetch(`${API_BASE}/sessions/${loopId}`);
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  return response.json();
}

export async function cancelSession(loopId: string): Promise<CancelResponse> {
  const response = await fetch(`${API_BASE}/sessions/${loopId}/cancel`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  return response.json();
}

export async function deleteSession(loopId: string): Promise<DeleteResponse> {
  const response = await fetch(`${API_BASE}/sessions/${loopId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  return response.json();
}
