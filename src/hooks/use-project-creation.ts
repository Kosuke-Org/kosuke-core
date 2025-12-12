import { useToast } from '@/hooks/use-toast';
import type { Project } from '@/lib/db/schema';
import type { ApiSuccess } from '@/lib/types';
import type { CreateProjectData, ProjectCreationStep } from '@/lib/types/project';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

export function useProjectCreation() {
  const [currentStep, setCurrentStep] = useState<ProjectCreationStep>({
    step: 'project-details',
  });
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();

  const createProjectMutation = useMutation({
    mutationFn: async (data: CreateProjectData): Promise<Project> => {
      setCurrentStep({ step: 'creating', data });

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create project');
      }

      const result: ApiSuccess<{ project: Project }> = await response.json();
      return result.data.project;
    },
    onSuccess: project => {
      setCurrentStep({ step: 'complete', data: currentStep.data });
      queryClient.invalidateQueries({ queryKey: ['projects'] });

      toast({
        title: 'Project Created',
        description: `Successfully created ${project.name} with GitHub integration.`,
      });

      // Navigate after a brief delay to show success state
      setTimeout(() => {
        router.replace(`/projects/${project.id}`);
      }, 200);
    },
    onError: error => {
      setCurrentStep({
        step: 'project-details',
        data: currentStep.data,
        error: error.message,
      });

      toast({
        title: 'Failed to Create Project',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetCreation = useCallback(() => {
    setCurrentStep({ step: 'project-details' });
  }, []);

  return {
    currentStep,
    setCurrentStep,
    createProject: createProjectMutation.mutate,
    isCreating: createProjectMutation.isPending,
    resetCreation,
  };
}
