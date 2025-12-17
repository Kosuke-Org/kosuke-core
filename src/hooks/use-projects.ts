'use client';

import type { Project } from '@/lib/db/schema';
import { useOrganization } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface UseProjectsOptions {
  userId: string;
}

export function useProjects({ userId }: UseProjectsOptions) {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  return useQuery<Project[]>({
    queryKey: ['projects', userId, orgId],
    queryFn: async () => {
      try {
        // Make the API call (userId and orgId are obtained from auth on server side)
        const response = await fetch('/api/projects');
        if (!response.ok) {
          throw new Error('Failed to fetch projects');
        }

        // The data is returned directly as an array, not as { projects: [] }
        const projects = await response.json();
        return projects;
      } catch (error) {
        console.error('Failed to fetch projects', error);
        return [];
      }
    },
    staleTime: 1000 * 60 * 5, // Consider data stale after 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus to reduce glitches
    refetchOnMount: false, // Don't always refetch on mount - let staleTime control this
    enabled: !!userId && !!orgId,
  });
}

interface ProjectWithMeta extends Project {
  model?: string;
}

export function useProject(projectId: string) {
  return useQuery<ProjectWithMeta, Error>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('useProject: Failed to fetch project:', errorText);
        throw new Error(`Failed to fetch project: ${response.status} ${errorText}`);
      }

      const responseData = await response.json();
      const { data, meta } = responseData;

      return {
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        model: meta?.model,
      };
    },
    staleTime: 1000 * 60 * 2, // Consider data stale after 2 minutes
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, string | { projectId: string; deleteRepo?: boolean }>({
    mutationFn: async input => {
      const { projectId, deleteRepo } =
        typeof input === 'string' ? { projectId: input, deleteRepo: false } : input;

      // Ensure at least 2 seconds pass for UI feedback
      const startTime = Date.now();
      const minOperationTime = 2000;

      // Call the main delete endpoint which handles everything
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteRepo: Boolean(deleteRepo) }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete project');
      }

      // Ensure the operation takes at least minOperationTime for better UX
      const operationTime = Date.now() - startTime;
      if (operationTime < minOperationTime) {
        await new Promise(resolve => setTimeout(resolve, minOperationTime - operationTime));
      }

      return projectId;
    },
    onSuccess: projectId => {
      // Invalidate all relevant queries with proper scope
      queryClient.invalidateQueries({
        queryKey: ['projects'],
        refetchType: 'active',
      });

      // Invalidate specific project-related queries
      queryClient.invalidateQueries({
        queryKey: ['files', projectId],
      });

      queryClient.invalidateQueries({
        queryKey: ['project', projectId],
      });

      // Give the UI time to update before refetching
      setTimeout(() => {
        queryClient.refetchQueries({
          queryKey: ['projects'],
        });
      }, 300);
    },
  });
}
