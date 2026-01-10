import { useOrganization } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';

interface OrganizationDetails {
  id: string;
  name: string;
  isBeta: boolean;
}

/**
 * Hook to get organization beta status
 * Fetches organization details from backend which includes isBeta from Clerk metadata
 */
export function useOrganizationBeta() {
  const { organization, isLoaded } = useOrganization();

  const { data, isLoading, error } = useQuery<OrganizationDetails>({
    queryKey: ['organization-details', organization?.id],
    queryFn: async () => {
      if (!organization?.id) throw new Error('No organization');

      const response = await fetch(`/api/organizations/${organization.id}/details`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch organization details');
      }

      const result = await response.json();
      return result.data;
    },
    enabled: isLoaded && !!organization?.id,
    staleTime: 1000 * 30, // 30 seconds - shorter to catch admin updates quickly
    refetchOnMount: 'always', // Always refetch when component mounts
    retry: 1,
  });

  // Log errors in development
  if (error && process.env.NODE_ENV === 'development') {
    console.error('[useOrganizationBeta] Error:', error);
  }

  return {
    isBeta: data?.isBeta ?? false,
    isLoading: !isLoaded || isLoading,
  };
}
