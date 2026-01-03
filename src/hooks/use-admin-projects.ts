import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { ProjectStatus } from '@/lib/db/schema';

interface UpdatePaymentStatusParams {
  projectId: string;
  status?: ProjectStatus;
  stripeInvoiceUrl?: string;
}

/**
 * Hook to update project payment status and/or Stripe invoice URL
 * Used by super admins in the admin project detail page
 */
export function useUpdatePaymentStatus() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, status, stripeInvoiceUrl }: UpdatePaymentStatusParams) => {
      const response = await fetch(`/api/admin/projects/${projectId}/update-payment-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, stripeInvoiceUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update payment status');
      }

      return response.json();
    },
    onSuccess: (_data, { projectId }) => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['admin-project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });

      toast({
        title: 'Success',
        description: 'Project payment status updated successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to mark a project as ready (transition from in_development to active)
 * Used by super admins in the admin project detail page
 */
export function useMarkProjectReady() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await fetch(`/api/admin/projects/${projectId}/mark-ready`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to mark project as ready');
      }

      return response.json();
    },
    onSuccess: (_data, projectId) => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['admin-project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });

      toast({
        title: 'Success',
        description: 'Project marked as ready and notifications sent to organization members',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
