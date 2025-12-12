'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Copy, ExternalLink, Rocket } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarkProjectReady } from '@/hooks/use-admin-projects';
import { useToast } from '@/hooks/use-toast';

interface AdminProject {
  id: string;
  name: string;
  description: string | null;
  orgId: string | null;
  createdBy: string | null;
  createdAt: string;
  requirementsCompletedAt: string | null;
  requirementsCompletedBy: string | null;
  githubRepoUrl: string | null;
}

export default function AdminProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const [markReadyDialogOpen, setMarkReadyDialogOpen] = useState(false);

  // Fetch single project
  const { data: projects, isLoading } = useQuery<AdminProject[]>({
    queryKey: ['admin-project', id],
    queryFn: async () => {
      const response = await fetch(`/api/admin/projects?search=${id}`);
      if (!response.ok) throw new Error('Failed to fetch project');
      const result = await response.json();
      return result.data.projects;
    },
  });

  const project = projects?.find(p => p.id === id);

  // Mark project as ready mutation
  const markReadyMutation = useMarkProjectReady();

  const handleDeploy = () => {
    toast({
      title: 'Deploy Feature Coming Soon',
      description: 'Project deployment functionality will be available soon.',
    });
  };

  const handleClone = () => {
    if (!project?.githubRepoUrl) {
      toast({
        title: 'No Repository URL',
        description: 'This project does not have a GitHub repository configured.',
        variant: 'destructive',
      });
      return;
    }

    const cloneCommand = `git clone ${project.githubRepoUrl}`;
    navigator.clipboard.writeText(cloneCommand).then(
      () => {
        toast({
          title: 'Copied to Clipboard',
          description: `Clone command copied: ${cloneCommand}`,
        });
      },
      () => {
        toast({
          title: 'Failed to Copy',
          description: 'Could not copy to clipboard.',
          variant: 'destructive',
        });
      }
    );
  };

  const handleMarkReady = () => {
    if (!project) return;
    markReadyMutation.mutate(project.id, {
      onSuccess: () => {
        setMarkReadyDialogOpen(false);
      },
    });
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (!project) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">Project not found</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header - Title, Description, Status, and Action buttons */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          {project.description && <p className="text-muted-foreground">{project.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" asChild>
            <Link href={`/projects/${project.id}`} target="_blank">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Project Space
            </Link>
          </Button>
          <Button onClick={handleClone} variant="outline" disabled={!project.githubRepoUrl}>
            <Copy className="h-4 w-4 mr-2" />
            Clone
          </Button>
          <Button onClick={handleDeploy}>
            <Rocket className="h-4 w-4 mr-2" />
            Deploy
          </Button>
        </div>
      </div>

      {/* Project Overview Card */}
      <Card>
        <CardContent>
          {/* Project Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Project ID</h4>
                <p className="text-sm font-mono">{project.id}</p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Organization ID</h4>
                <p className="text-sm">{project.orgId || 'N/A'}</p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Created By</h4>
                <p className="text-sm">{project.createdBy || 'Unknown'}</p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                  GitHub Repository
                </h4>
                {project.githubRepoUrl ? (
                  <Button variant="link" className="h-auto p-0 text-sm" asChild>
                    <Link href={project.githubRepoUrl} target="_blank" rel="noopener noreferrer">
                      {project.githubRepoUrl}
                    </Link>
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">Not configured</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Created At</h4>
                <p className="text-sm">
                  {new Date(project.createdAt).toLocaleString()}
                  <span className="text-muted-foreground ml-2">
                    ({formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })})
                  </span>
                </p>
              </div>

              {project.requirementsCompletedAt && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Requirements Completed
                  </h4>
                  <p className="text-sm">
                    {new Date(project.requirementsCompletedAt).toLocaleString()}
                  </p>
                  {project.requirementsCompletedBy && (
                    <p className="text-sm text-muted-foreground">
                      By: {project.requirementsCompletedBy}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mark as Ready Confirmation Dialog */}
      <AlertDialog open={markReadyDialogOpen} onOpenChange={setMarkReadyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Project as Active?</AlertDialogTitle>
            <AlertDialogDescription>
              This will transition the project from &quot;In Development&quot; to &quot;Active&quot;
              status. Email notifications will be sent to all organization members informing them
              that the project is ready to use.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markReadyMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMarkReady} disabled={markReadyMutation.isPending}>
              {markReadyMutation.isPending ? 'Processing...' : 'Mark as Active'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Title skeleton */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Card skeleton */}
      <Card>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
