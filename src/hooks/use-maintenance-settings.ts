import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { useToast } from '@/hooks/use-toast';

/**
 * Zod schema for maintenance settings response
 */
const maintenanceSettingsSchema = z.object({
  syncRulesEnabled: z.boolean(),
  analyzeEnabled: z.boolean(),
  securityCheckEnabled: z.boolean(),
});

type MaintenanceSettingsData = z.infer<typeof maintenanceSettingsSchema>;

/**
 * Update input type
 */
interface UpdateMaintenanceSettingsInput {
  syncRulesEnabled?: boolean;
  analyzeEnabled?: boolean;
  securityCheckEnabled?: boolean;
}

/**
 * Query key factory for maintenance settings
 */
const maintenanceSettingsKeys = {
  all: ['maintenance-settings'] as const,
  detail: (projectId: string) => [...maintenanceSettingsKeys.all, projectId] as const,
};

/**
 * Hook for managing project maintenance settings
 */
export function useMaintenanceSettings(projectId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /**
   * Fetch maintenance settings
   */
  const query = useQuery({
    queryKey: maintenanceSettingsKeys.detail(projectId ?? ''),
    queryFn: async (): Promise<MaintenanceSettingsData> => {
      if (!projectId) throw new Error('Project ID is required');

      const response = await fetch(`/api/projects/${projectId}/maintenance-settings`);
      if (!response.ok) {
        throw new Error('Failed to fetch maintenance settings');
      }

      const { data } = await response.json();
      return maintenanceSettingsSchema.parse(data);
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  /**
   * Update maintenance settings mutation
   */
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateMaintenanceSettingsInput) => {
      if (!projectId) throw new Error('Project ID is required');

      const response = await fetch(`/api/projects/${projectId}/maintenance-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to update maintenance settings');
      }

      return maintenanceSettingsSchema.parse(responseData.data);
    },
    onSuccess: data => {
      // Update cache with new data
      queryClient.setQueryData(maintenanceSettingsKeys.detail(projectId!), data);

      toast({
        title: 'Settings saved',
        description: 'Maintenance settings have been updated.',
      });
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update settings',
        variant: 'destructive',
      });
    },
  });

  return {
    // Query data
    settings: query.data,
    isLoading: query.isLoading,
    error: query.error,

    // Mutation
    updateSettings: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
}
