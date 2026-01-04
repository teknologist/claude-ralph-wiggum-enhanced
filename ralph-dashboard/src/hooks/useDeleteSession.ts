import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteSession } from '../lib/api';

export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSession,
    onSuccess: () => {
      // Invalidate sessions query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
