import { useQuery } from '@tanstack/react-query';
import { fetchSessions } from '../lib/api';

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
    refetchInterval: 5000, // Poll every 5 seconds for active sessions
  });
}
