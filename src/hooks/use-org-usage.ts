import { useQuery } from '@tanstack/react-query';

import type { OrgUsage } from '@/lib/types';

/**
 * Query key factory for organization usage
 */
const orgUsageKeys = {
  all: ['org-usage'] as const,
  detail: (orgId: string) => [...orgUsageKeys.all, orgId] as const,
};

/**
 * API response type
 */
interface OrgUsageResponse {
  success: boolean;
  data: OrgUsage;
  langfuseUrl?: string;
}

/**
 * Return type for the hook
 */
interface OrgUsageData {
  usage: OrgUsage;
  langfuseUrl?: string;
}

/**
 * Hook for fetching organization usage data from Langfuse
 */
export function useOrgUsage(orgId: string | undefined) {
  return useQuery({
    queryKey: orgUsageKeys.detail(orgId ?? ''),
    queryFn: async (): Promise<OrgUsageData> => {
      if (!orgId) throw new Error('Organization ID is required');

      const response = await fetch(`/api/organizations/${orgId}/usage`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch usage data');
      }

      const result: OrgUsageResponse = await response.json();
      return {
        usage: result.data,
        langfuseUrl: result.langfuseUrl,
      };
    },
    enabled: !!orgId,
    staleTime: 0,
    gcTime: 0,
  });
}
