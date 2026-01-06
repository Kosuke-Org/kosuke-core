'use client';

import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Play, RefreshCw, Search, Shield } from 'lucide-react';

import { AsyncMultiSelect } from '@/components/ui/async-multi-select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Project {
  id: string;
  name: string;
}

const JOB_TYPES = [
  {
    value: 'sync_rules',
    label: 'Sync Rules',
    description: 'Synchronize CLAUDE.md and project rules',
    icon: RefreshCw,
  },
  {
    value: 'analyze',
    label: 'Analyze',
    description: 'Run comprehensive code analysis',
    icon: Search,
  },
  {
    value: 'security_check',
    label: 'Security Check',
    description: 'Scan for security vulnerabilities',
    icon: Shield,
  },
] as const;

type JobType = (typeof JOB_TYPES)[number]['value'];

export function TriggerMaintenanceJobDialog() {
  const [open, setOpen] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<Project[]>([]);
  const [selectedJobType, setSelectedJobType] = useState<JobType | ''>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Search function for AsyncMultiSelect
  const searchProjects = useCallback(async (query: string): Promise<Project[]> => {
    const params = new URLSearchParams({ limit: '20' });
    if (query) {
      params.set('search', query);
    }
    const response = await fetch(`/api/admin/projects?${params.toString()}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch projects (${response.status})`);
    }
    const data = await response.json();
    return data.data?.projects || [];
  }, []);

  // Trigger mutation
  const triggerMutation = useMutation({
    mutationFn: async ({ projectIds, jobType }: { projectIds: string[]; jobType: JobType }) => {
      const response = await fetch('/api/admin/maintenance-jobs/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds, jobType }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to trigger job');
      }
      return response.json();
    },
    onSuccess: data => {
      toast({
        title: 'Jobs Triggered',
        description: data.data?.message || 'Maintenance jobs have been queued',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-maintenance-jobs'] });
      setOpen(false);
      setSelectedProjects([]);
      setSelectedJobType('');
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to trigger job',
        variant: 'destructive',
      });
    },
  });

  const handleTrigger = () => {
    if (!selectedJobType) return;
    triggerMutation.mutate({
      projectIds: selectedProjects.map(p => p.id),
      jobType: selectedJobType,
    });
  };

  const selectedJobTypeInfo = JOB_TYPES.find(j => j.value === selectedJobType);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Play className="h-4 w-4" />
          Trigger Job
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trigger Maintenance Job</DialogTitle>
          <DialogDescription>
            Manually trigger a maintenance job. Jobs will be queued and processed immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Project Multi-Select */}
          <div className="space-y-2">
            <Label>Projects</Label>
            <AsyncMultiSelect
              value={selectedProjects}
              onChange={setSelectedProjects}
              onSearch={searchProjects}
              getOptionLabel={p => p.name}
              getOptionValue={p => p.id}
              placeholder="Select projects..."
              searchPlaceholder="Search by name or ID..."
              emptyMessage="No projects found"
            />
            <p className="text-muted-foreground text-xs">Leave empty to run for all projects</p>
          </div>

          {/* Job Type Selector */}
          <div className="space-y-2">
            <Label>Job Type</Label>
            <Select value={selectedJobType} onValueChange={v => setSelectedJobType(v as JobType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select job type..." />
              </SelectTrigger>
              <SelectContent>
                {JOB_TYPES.map(jobType => {
                  const Icon = jobType.icon;
                  return (
                    <SelectItem key={jobType.value} value={jobType.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span>{jobType.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedJobTypeInfo && (
              <p className="text-muted-foreground text-xs">{selectedJobTypeInfo.description}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleTrigger} disabled={!selectedJobType || triggerMutation.isPending}>
            {triggerMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Triggering...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Trigger{' '}
                {selectedProjects.length === 0
                  ? 'for All'
                  : `${selectedProjects.length} Job${selectedProjects.length !== 1 ? 's' : ''}`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
