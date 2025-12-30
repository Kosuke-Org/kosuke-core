import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { useToast } from '@/hooks/use-toast';

/**
 * Zod schema for API key status response
 */
const apiKeyStatusSchema = z.object({
  hasCustomKey: z.boolean(),
  maskedKey: z.string().nullable(),
  updatedAt: z.string().optional(),
});

type ApiKeyStatus = z.infer<typeof apiKeyStatusSchema>;

/**
 * Zod schema for save API key response
 */
const saveApiKeyResponseSchema = z.object({
  success: z.boolean(),
  maskedKey: z.string(),
});

/**
 * Query key factory for organization API keys
 */
const organizationApiKeysKeys = {
  all: ['organization-api-keys'] as const,
  detail: (orgId: string) => [...organizationApiKeysKeys.all, orgId] as const,
};

/**
 * Hook for managing organization Anthropic API keys
 */
export function useOrganizationApiKeys(orgId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /**
   * Fetch API key status
   */
  const statusQuery = useQuery({
    queryKey: organizationApiKeysKeys.detail(orgId ?? ''),
    queryFn: async (): Promise<ApiKeyStatus> => {
      if (!orgId) throw new Error('Organization ID is required');

      const response = await fetch(`/api/organizations/${orgId}/api-keys`);
      if (!response.ok) {
        throw new Error('Failed to fetch API key status');
      }

      const data = await response.json();
      return apiKeyStatusSchema.parse(data);
    },
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  /**
   * Save API key mutation
   */
  const saveMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      if (!orgId) throw new Error('Organization ID is required');

      const response = await fetch(`/api/organizations/${orgId}/api-keys`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anthropicApiKey: apiKey }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save API key');
      }

      return saveApiKeyResponseSchema.parse(data);
    },
    onSuccess: data => {
      queryClient.setQueryData(organizationApiKeysKeys.detail(orgId!), {
        hasCustomKey: true,
        maskedKey: data.maskedKey,
      } satisfies ApiKeyStatus);

      toast({
        title: 'API key saved',
        description: 'Your Anthropic API key has been saved and validated.',
      });
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save API key',
        variant: 'destructive',
      });
    },
  });

  /**
   * Delete API key mutation
   */
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('Organization ID is required');

      const response = await fetch(`/api/organizations/${orgId}/api-keys`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete API key');
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(organizationApiKeysKeys.detail(orgId!), {
        hasCustomKey: false,
        maskedKey: null,
      } satisfies ApiKeyStatus);

      toast({
        title: 'API key removed',
        description: 'Your organization will now use the system default API key.',
      });
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete API key',
        variant: 'destructive',
      });
    },
  });

  return {
    // Status query
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    error: statusQuery.error,

    // Save mutation
    saveApiKey: saveMutation.mutate,
    isSaving: saveMutation.isPending,

    // Delete mutation
    deleteApiKey: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
