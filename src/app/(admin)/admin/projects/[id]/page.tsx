'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, Copy, ExternalLink, Loader2, Play, Rocket, Save } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDeployConfig,
  useDeployJob,
  useDeployLogs,
  useTriggerDeploy,
  useUpdateDeployConfig,
} from '@/hooks/use-admin-deploy';
import { useMarkProjectReady, useUpdatePaymentStatus } from '@/hooks/use-admin-projects';
import { useTriggerVamos, useVamosJob, useVamosLogs } from '@/hooks/use-admin-vamos';
import { useAgentHealth } from '@/hooks/use-agent-health';
import { useToast } from '@/hooks/use-toast';
import type { ProjectStatus } from '@/lib/db/schema';
import { cn } from '@/lib/utils';

import { DeployConfigModal } from './components/deploy-config-modal';
import { StreamingLogsDialog } from './components/streaming-logs-dialog';

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
  status: ProjectStatus;
  stripeInvoiceUrl: string | null;
}

// Status badge configuration
const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  requirements: { label: 'Requirements', variant: 'secondary' },
  requirements_ready: { label: 'Requirements Ready', variant: 'secondary' },
  environments_ready: { label: 'Environments Ready', variant: 'secondary' },
  waiting_for_payment: { label: 'Waiting for Payment', variant: 'outline' },
  paid: { label: 'Paid', variant: 'default' },
  in_development: { label: 'In Development', variant: 'default' },
  active: { label: 'Active', variant: 'default' },
};

export default function AdminProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const [markReadyDialogOpen, setMarkReadyDialogOpen] = useState(false);
  const [stripeInvoiceUrlInput, setStripeInvoiceUrlInput] = useState('');
  const [statusTransitionDialogOpen, setStatusTransitionDialogOpen] = useState(false);
  const [pendingStatusTransition, setPendingStatusTransition] = useState<ProjectStatus | null>(
    null
  );

  // Vamos & Deploy UI state
  const [vamosLogsSheetOpen, setVamosLogsSheetOpen] = useState(false);
  const [deployLogsSheetOpen, setDeployLogsSheetOpen] = useState(false);
  const [deployConfigModalOpen, setDeployConfigModalOpen] = useState(false);

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

  // Initialize stripe invoice URL input when project loads
  useEffect(() => {
    if (project?.stripeInvoiceUrl) {
      setStripeInvoiceUrlInput(project.stripeInvoiceUrl);
    }
  }, [project?.stripeInvoiceUrl]);

  // Mark project as ready mutation
  const markReadyMutation = useMarkProjectReady();

  // Update payment status mutation
  const updatePaymentStatusMutation = useUpdatePaymentStatus();

  // Vamos hooks
  const { data: vamosJobData } = useVamosJob(id, !!project);
  const triggerVamosMutation = useTriggerVamos();
  const { data: vamosLogsData } = useVamosLogs(id, vamosJobData?.job?.id || null);

  // Deploy hooks
  const { data: deployConfig, isLoading: isLoadingDeployConfig } = useDeployConfig(id, !!project);
  const { data: deployJobData } = useDeployJob(id, !!project);
  const triggerDeployMutation = useTriggerDeploy();
  const updateDeployConfigMutation = useUpdateDeployConfig();
  const { data: deployLogsData } = useDeployLogs(id, deployJobData?.job?.id || null);

  // Agent health - only poll when project is paid (vamos/deploy available)
  const { data: agentHealth } = useAgentHealth({
    projectId: id,
    enabled: Boolean(id) && project?.status === 'paid',
    pollingInterval: 10000,
  });

  // Agent is ready when running, alive, and explicitly ready
  const isAgentReady = Boolean(agentHealth?.running && agentHealth?.alive && agentHealth?.ready);

  // Helper to get agent status display
  const getAgentStatusDisplay = () => {
    if (!agentHealth) {
      return { color: 'bg-muted-foreground', text: 'Checking...', pulse: true };
    }
    if (!agentHealth.running) {
      return { color: 'bg-muted-foreground', text: 'Sandbox stopped', pulse: false };
    }
    if (!agentHealth.alive) {
      return { color: 'bg-yellow-500', text: 'Agent starting...', pulse: true };
    }
    if (agentHealth.processing) {
      return { color: 'bg-blue-500', text: 'Processing', pulse: true };
    }
    if (agentHealth.ready) {
      return { color: 'bg-green-500', text: 'Ready', pulse: false };
    }
    return { color: 'bg-yellow-500', text: 'Busy', pulse: true };
  };

  const handleVamos = () => {
    // If there's already a running job OR agent is processing, open the logs sheet
    if (
      vamosJobData?.job?.status === 'running' ||
      vamosJobData?.job?.status === 'pending' ||
      agentHealth?.processing
    ) {
      setVamosLogsSheetOpen(true);
      return;
    }

    // Early return if agent not ready (can't trigger new job)
    if (!isAgentReady) return;

    // Trigger a new vamos job
    triggerVamosMutation.mutate(
      { projectId: id, withTests: true, isolated: false },
      {
        onSuccess: () => {
          setVamosLogsSheetOpen(true);
        },
      }
    );
  };

  const handleDeploy = () => {
    // If there's already a running deploy job OR agent is processing, open the logs sheet
    if (
      deployJobData?.job?.status === 'running' ||
      deployJobData?.job?.status === 'pending' ||
      agentHealth?.processing
    ) {
      setDeployLogsSheetOpen(true);
      return;
    }

    // Early return if agent not ready (can't trigger new job)
    if (!isAgentReady) return;

    // If still loading deploy config, wait
    if (isLoadingDeployConfig) {
      toast({
        title: 'Loading Configuration',
        description: 'Please wait while we load the deploy configuration.',
      });
      return;
    }

    // If no production config exists, open config modal first
    if (!deployConfig?.hasProductionConfig) {
      setDeployConfigModalOpen(true);
      return;
    }

    // Trigger deploy
    triggerDeployMutation.mutate(id, {
      onSuccess: () => {
        setDeployLogsSheetOpen(true);
      },
    });
  };

  const handleSaveDeployConfig = (
    production: Parameters<typeof updateDeployConfigMutation.mutate>[0]['production']
  ) => {
    updateDeployConfigMutation.mutate(
      { projectId: id, production },
      {
        onSuccess: () => {
          setDeployConfigModalOpen(false);
          // After saving config, trigger deploy
          triggerDeployMutation.mutate(id, {
            onSuccess: () => {
              setDeployLogsSheetOpen(true);
            },
          });
        },
      }
    );
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

  const handleSaveStripeInvoiceUrl = () => {
    if (!project) return;
    updatePaymentStatusMutation.mutate({
      projectId: project.id,
      stripeInvoiceUrl: stripeInvoiceUrlInput,
    });
  };

  const handleStatusTransition = (newStatus: ProjectStatus) => {
    // Require Stripe Invoice URL to be saved before transitioning to waiting_for_payment
    if (newStatus === 'waiting_for_payment' && !project?.stripeInvoiceUrl) {
      toast({
        title: 'Invoice URL Required',
        description:
          'Please save a Stripe Invoice URL before transitioning to "Waiting for Payment".',
        variant: 'destructive',
      });
      return;
    }
    setPendingStatusTransition(newStatus);
    setStatusTransitionDialogOpen(true);
  };

  const confirmStatusTransition = () => {
    if (!project || !pendingStatusTransition) return;
    updatePaymentStatusMutation.mutate(
      {
        projectId: project.id,
        status: pendingStatusTransition,
      },
      {
        onSuccess: () => {
          setStatusTransitionDialogOpen(false);
          setPendingStatusTransition(null);
        },
      }
    );
  };

  if (isLoading || !projects) {
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
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            {/* Agent status badge - only show when project is paid */}
            {project.status === 'paid' &&
              (() => {
                const agentStatus = getAgentStatusDisplay();
                return (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Agent:</span>
                    <div className="relative">
                      <div className={cn('h-2 w-2 rounded-full', agentStatus.color)} />
                      {agentStatus.pulse && (
                        <div
                          className={cn(
                            'absolute inset-0 h-2 w-2 rounded-full animate-ping opacity-75',
                            agentStatus.color
                          )}
                        />
                      )}
                    </div>
                    <span className="font-medium">{agentStatus.text}</span>
                  </div>
                );
              })()}
          </div>
          {project.description && <p className="text-muted-foreground">{project.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" asChild>
            <Link href={`/projects/${project.id}`} target="_blank">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Project Space
            </Link>
          </Button>
          {/* Status Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={updatePaymentStatusMutation.isPending}>
                {STATUS_CONFIG[project.status]?.label || project.status}
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(STATUS_CONFIG) as ProjectStatus[]).map(status => (
                <DropdownMenuItem
                  key={status}
                  disabled={status === project.status}
                  onClick={() => handleStatusTransition(status)}
                >
                  {STATUS_CONFIG[status].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleClone} variant="outline" disabled={!project.githubRepoUrl}>
            <Copy className="h-4 w-4 mr-2" />
            Clone
          </Button>
          {project.status === 'paid' && (
            <>
              <Button
                onClick={handleVamos}
                variant="outline"
                disabled={
                  (!isAgentReady &&
                    !agentHealth?.processing &&
                    vamosJobData?.job?.status !== 'running' &&
                    vamosJobData?.job?.status !== 'pending') ||
                  triggerVamosMutation.isPending
                }
              >
                {triggerVamosMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {vamosJobData?.job?.status === 'running' || agentHealth?.processing
                  ? 'View Vamos'
                  : 'Vamos'}
              </Button>
              <Button
                onClick={handleDeploy}
                disabled={
                  (!isAgentReady &&
                    !agentHealth?.processing &&
                    deployJobData?.job?.status !== 'running' &&
                    deployJobData?.job?.status !== 'pending') ||
                  triggerDeployMutation.isPending
                }
              >
                {triggerDeployMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4 mr-2" />
                )}
                {deployJobData?.job?.status === 'running' || agentHealth?.processing
                  ? 'View Deploy'
                  : 'Deploy'}
              </Button>
            </>
          )}
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

      {/* Payment Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Payment Status</CardTitle>
          <CardDescription>
            Set the Stripe invoice URL for this project. Use the status dropdown in the header to
            transition between payment states.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="stripeInvoiceUrl">Stripe Invoice URL</Label>
            <div className="flex gap-2">
              <Input
                id="stripeInvoiceUrl"
                placeholder="https://invoice.stripe.com/..."
                value={stripeInvoiceUrlInput}
                onChange={e => setStripeInvoiceUrlInput(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={handleSaveStripeInvoiceUrl}
                disabled={
                  updatePaymentStatusMutation.isPending ||
                  stripeInvoiceUrlInput === (project.stripeInvoiceUrl || '')
                }
              >
                {updatePaymentStatusMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span className="ml-2">Save</span>
              </Button>
            </div>
            {project.stripeInvoiceUrl && (
              <p className="text-sm text-muted-foreground">
                Current:{' '}
                <Link
                  href={project.stripeInvoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {project.stripeInvoiceUrl}
                </Link>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status Transition Confirmation Dialog */}
      <AlertDialog open={statusTransitionDialogOpen} onOpenChange={setStatusTransitionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
            <AlertDialogDescription>
              Change status from &quot;{STATUS_CONFIG[project.status]?.label}&quot; to &quot;
              {pendingStatusTransition && STATUS_CONFIG[pendingStatusTransition]?.label}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatePaymentStatusMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusTransition}
              disabled={updatePaymentStatusMutation.isPending}
            >
              {updatePaymentStatusMutation.isPending ? 'Processing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Vamos Streaming Logs Dialog */}
      <StreamingLogsDialog
        open={vamosLogsSheetOpen}
        onOpenChange={setVamosLogsSheetOpen}
        title={`Running vamos for ${project.name}`}
        job={
          vamosLogsData?.job || vamosJobData?.job
            ? {
                id: (vamosLogsData?.job || vamosJobData?.job)!.id,
                status: (vamosLogsData?.job || vamosJobData?.job)!.status,
                phase: (vamosLogsData?.job || vamosJobData?.job)!.phase,
                totalPhases: (vamosLogsData?.job || vamosJobData?.job)!.totalPhases,
                completedPhases: (vamosLogsData?.job || vamosJobData?.job)!.completedPhases,
                error: (vamosLogsData?.job || vamosJobData?.job)!.error,
                createdAt: (vamosLogsData?.job || vamosJobData?.job)!.createdAt,
                startedAt: (vamosLogsData?.job || vamosJobData?.job)!.startedAt,
                completedAt: (vamosLogsData?.job || vamosJobData?.job)!.completedAt,
              }
            : null
        }
        logs={vamosLogsData?.logs || []}
        onRestart={() =>
          triggerVamosMutation.mutate({ projectId: id, withTests: true, isolated: false })
        }
        isRestarting={triggerVamosMutation.isPending}
      />

      {/* Deploy Streaming Logs Dialog */}
      <StreamingLogsDialog
        open={deployLogsSheetOpen}
        onOpenChange={setDeployLogsSheetOpen}
        title={`Deploying ${project.name}`}
        job={
          deployLogsData?.job || deployJobData?.job
            ? {
                id: (deployLogsData?.job || deployJobData?.job)!.id,
                status: (deployLogsData?.job || deployJobData?.job)!.status,
                currentStep: (deployLogsData?.job || deployJobData?.job)!.currentStep,
                error: (deployLogsData?.job || deployJobData?.job)!.error,
                createdAt: (deployLogsData?.job || deployJobData?.job)!.createdAt,
                startedAt: (deployLogsData?.job || deployJobData?.job)!.startedAt,
                completedAt: (deployLogsData?.job || deployJobData?.job)!.completedAt,
              }
            : null
        }
        logs={deployLogsData?.logs || []}
      />

      {/* Deploy Config Modal */}
      <DeployConfigModal
        open={deployConfigModalOpen}
        onOpenChange={setDeployConfigModalOpen}
        existingConfig={deployConfig?.config || null}
        onSave={handleSaveDeployConfig}
        isSaving={updateDeployConfigMutation.isPending || triggerDeployMutation.isPending}
      />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Page Header - Title, Description, and Action buttons */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 flex-1">
          <Skeleton className="h-9 w-48" /> {/* Project name */}
          <Skeleton className="h-5 w-80" /> {/* Description */}
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-36" /> {/* View Project Space button */}
          <Skeleton className="h-9 w-28" /> {/* Status dropdown */}
          <Skeleton className="h-9 w-20" /> {/* Clone button */}
          <Skeleton className="h-9 w-24" /> {/* Deploy button */}
        </div>
      </div>

      {/* Project Overview Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-4">
              {/* Project ID */}
              <div>
                <Skeleton className="h-4 w-16 mb-1" />
                <Skeleton className="h-4 w-64" />
              </div>
              {/* Organization ID */}
              <div>
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-4 w-48" />
              </div>
              {/* Created By */}
              <div>
                <Skeleton className="h-4 w-20 mb-1" />
                <Skeleton className="h-4 w-32" />
              </div>
              {/* GitHub Repository */}
              <div>
                <Skeleton className="h-4 w-28 mb-1" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Created At */}
              <div>
                <Skeleton className="h-4 w-20 mb-1" />
                <Skeleton className="h-4 w-72" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
