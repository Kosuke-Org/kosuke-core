'use client';

import { Activity, AlertCircle, CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAllJobs } from '@/hooks/use-admin-jobs';
import { useTablePagination } from '@/hooks/table/use-table-pagination';
import type { JobStatus } from '@/lib/types';

import { JobsDataTable } from './components/jobs-data-table';

const STATUS_CONFIG: Record<
  JobStatus,
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  failed: { icon: XCircle, label: 'Failed' },
  active: { icon: Activity, label: 'Active' },
  waiting: { icon: Clock, label: 'Waiting' },
  completed: { icon: CheckCircle2, label: 'Completed' },
  delayed: { icon: AlertCircle, label: 'Delayed' },
};

const STATUS_ORDER: JobStatus[] = ['failed', 'active', 'waiting', 'completed', 'delayed'];

export default function AdminJobsPage() {
  const [selectedStatus, setSelectedStatus] = useState<JobStatus>('failed');

  const { page, pageSize, setPage, setPageSize } = useTablePagination({
    initialPage: 1,
    initialPageSize: 20,
  });

  // Fetch all jobs from all queues
  const { data, isLoading, refetch } = useAllJobs({
    status: selectedStatus,
    page,
    pageSize,
  });

  const handleStatusChange = (status: JobStatus) => {
    setSelectedStatus(status);
    setPage(1);
  };

  // Loading state for initial load
  if (isLoading && !data) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground mt-2">Monitor BullMQ jobs across all queues</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Status Tabs with Counts */}
      <Tabs value={selectedStatus} onValueChange={v => handleStatusChange(v as JobStatus)}>
        <TabsList>
          {STATUS_ORDER.map(status => {
            const config = STATUS_CONFIG[status];
            const StatusIcon = config.icon;
            const count = data?.counts?.[status] ?? 0;

            return (
              <TabsTrigger key={status} value={status} className="gap-2">
                <StatusIcon className="h-4 w-4" />
                {config.label}
                {count > 0 && (
                  <Badge
                    variant={status === 'failed' ? 'destructive' : 'secondary'}
                    className="ml-1 h-5 min-w-[20px] px-1.5"
                  >
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Jobs Table */}
      <JobsDataTable
        jobs={data?.jobs || []}
        total={data?.pagination?.total || 0}
        page={page}
        pageSize={pageSize}
        totalPages={data?.pagination?.totalPages || 0}
        isLoading={isLoading}
        selectedStatus={selectedStatus}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-9 w-32 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-10 w-full max-w-2xl" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
