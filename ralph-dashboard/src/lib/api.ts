import type {
  Session,
  SessionsResponse,
  CancelResponse,
  DeleteResponse,
  ArchiveResponse,
  ErrorResponse,
  IterationsResponse,
  FullTranscriptResponse,
  TranscriptAvailabilityResponse,
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

export async function archiveSession(loopId: string): Promise<ArchiveResponse> {
  const response = await fetch(`${API_BASE}/sessions/${loopId}/archive`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  return response.json();
}

export async function fetchTranscriptIterations(
  loopId: string
): Promise<IterationsResponse> {
  const response = await fetch(`${API_BASE}/transcript/${loopId}/iterations`);
  // 404 means no iterations yet - return empty array instead of throwing
  if (response.status === 404) {
    return { iterations: [] };
  }
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  return response.json();
}

export async function fetchFullTranscript(
  loopId: string
): Promise<FullTranscriptResponse> {
  const response = await fetch(`${API_BASE}/transcript/${loopId}/full`);
  // 404 means no transcript yet - return empty array instead of throwing
  if (response.status === 404) {
    return { messages: [] };
  }
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  return response.json();
}

export async function checkTranscriptAvailability(
  loopId: string
): Promise<TranscriptAvailabilityResponse> {
  const response = await fetch(`${API_BASE}/transcript/${loopId}`);
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  return response.json();
}
