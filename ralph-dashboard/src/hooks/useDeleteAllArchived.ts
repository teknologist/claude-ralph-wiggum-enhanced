import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteAllArchivedSessions } from '../lib/api';

export function useDeleteAllArchived() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAllArchivedSessions,
    onSuccess: () => {
      // Invalidate sessions query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
