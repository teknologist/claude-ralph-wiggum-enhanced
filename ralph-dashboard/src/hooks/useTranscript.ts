import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  fetchTranscriptIterations,
  fetchFullTranscript,
  checkTranscriptAvailability,
} from '../lib/api';
import { subscribeToTranscript } from '../lib/websocket';
import type { IterationEntry } from '../../server/types';

interface IterationsResponse {
  iterations: IterationEntry[];
}

/**
 * Hook to fetch transcript iterations for a loop.
 * For active sessions, also subscribes to WebSocket for real-time updates.
 */
export function useTranscriptIterations(
  loopId: string,
  enabled: boolean,
  isActive: boolean = false
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['transcript', 'iterations', loopId],
    queryFn: () => fetchTranscriptIterations(loopId),
    enabled,
    staleTime: isActive ? 2000 : 30000, // Shorter stale time for active sessions
    retry: 1,
  });

  // Subscribe to WebSocket for real-time updates on active sessions
  useEffect(() => {
    if (!enabled || !isActive) return;

    const unsubscribe = subscribeToTranscript(loopId, (newIterations) => {
      // Update the React Query cache with new iterations
      queryClient.setQueryData<IterationsResponse>(
        ['transcript', 'iterations', loopId],
        (oldData) => {
          if (!oldData) {
            return { iterations: newIterations };
          }

          // Merge new iterations, avoiding duplicates
          const existingIds = new Set(
            oldData.iterations.map((i) => i.iteration)
          );
          const uniqueNewIterations = newIterations.filter(
            (i) => !existingIds.has(i.iteration)
          );

          if (uniqueNewIterations.length === 0) {
            return oldData;
          }

          return {
            iterations: [...oldData.iterations, ...uniqueNewIterations].sort(
              (a, b) => a.iteration - b.iteration
            ),
          };
        }
      );
    });

    return unsubscribe;
  }, [loopId, enabled, isActive, queryClient]);

  return query;
}

/**
 * Hook to fetch full transcript for a loop.
 * Only fetches when enabled is true (for lazy loading).
 */
export function useFullTranscript(loopId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['transcript', 'full', loopId],
    queryFn: () => fetchFullTranscript(loopId),
    enabled,
    staleTime: 60000, // Consider data fresh for 60 seconds
    retry: 1,
  });
}

/**
 * Hook to check transcript availability for a loop.
 */
export function useTranscriptAvailability(loopId: string) {
  return useQuery({
    queryKey: ['transcript', 'availability', loopId],
    queryFn: () => checkTranscriptAvailability(loopId),
    staleTime: 30000,
    retry: 1,
  });
}
