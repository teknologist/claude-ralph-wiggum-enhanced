import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cancelSession } from '../lib/api';

export function useCancelLoop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelSession,
    onSuccess: () => {
      // Invalidate sessions query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
