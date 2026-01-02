import type { ApiResponse } from '@/lib/api';
import type { GitHubRepository } from '@/lib/types/github';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

interface RepositoriesResponse {
  repositories: GitHubRepository[];
  hasMore: boolean;
  needsGitHubConnection: boolean;
  installUrl: string;
}

/**
 * Fetch all repositories the user has access to with their app installation status.
 * Repos with appInstalled=true can be imported directly.
 * Repos with appInstalled=false need the Kosuke app installed first.
 */
export function useGitHubRepositories(enabled: boolean = true, search: string = '') {
  const query = useInfiniteQuery({
    queryKey: ['github-repos-with-status', search],
    queryFn: async ({ pageParam }): Promise<RepositoriesResponse> => {
      console.log('[useGitHubRepositories] Fetching page:', pageParam, 'search:', search);
      const params = new URLSearchParams({
        page: pageParam.toString(),
        per_page: '10',
      });
      if (search) {
        params.append('search', search);
      }
      const response = await fetch(`/api/auth/github/repositories?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch GitHub repositories');
      }
      const data: ApiResponse<RepositoriesResponse> = await response.json();
      console.log('[useGitHubRepositories] Response:', data.data);
      return data.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      return lastPage.hasMore ? lastPageParam + 1 : undefined;
    },
    staleTime: 0, // Always stale
    gcTime: 0, // Never cache
    retry: 2,
    enabled,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const repositories = useMemo(
    () => query.data?.pages.flatMap(page => page.repositories) ?? [],
    [query.data?.pages]
  );

  const needsGitHubConnection = useMemo(
    () => query.data?.pages[0]?.needsGitHubConnection ?? false,
    [query.data?.pages]
  );

  const installUrl = useMemo(() => query.data?.pages[0]?.installUrl ?? '', [query.data?.pages]);

  return {
    ...query,
    repositories,
    needsGitHubConnection,
    installUrl,
  };
}
