'use client';

import { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Hash,
  Layers,
  RefreshCw,
  Tag,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { JobDetailsWithQueue, JobStatus } from '@/lib/types';

import { DataTableColumnHeader } from '../../components/data-table-column-header';

const statusConfig: Record<
  JobStatus,
  {
    icon: React.ComponentType<{ className?: string }>;
    variant: 'default' | 'destructive' | 'secondary' | 'outline';
    label: string;
  }
> = {
  completed: { icon: CheckCircle2, variant: 'default', label: 'Completed' },
  failed: { icon: XCircle, variant: 'destructive', label: 'Failed' },
  active: { icon: Activity, variant: 'secondary', label: 'Active' },
  waiting: { icon: Clock, variant: 'outline', label: 'Waiting' },
  delayed: { icon: AlertCircle, variant: 'outline', label: 'Delayed' },
};

interface GetJobsColumnsProps {
  selectedStatus: JobStatus;
}

export function getJobsColumns({
  selectedStatus,
}: GetJobsColumnsProps): ColumnDef<JobDetailsWithQueue>[] {
  return [
    {
      accessorKey: 'id',
      header: () => <DataTableColumnHeader title="Job ID" icon={<Hash size={16} />} />,
      cell: ({ row }) => (
        <div className="font-mono text-xs text-muted-foreground">{row.original.id}</div>
      ),
    },
    {
      accessorKey: 'name',
      header: () => <DataTableColumnHeader title="Name" icon={<Tag size={16} />} />,
      cell: ({ row }) => <div className="font-medium text-sm">{row.original.name}</div>,
    },
    {
      accessorKey: 'queueName',
      header: () => <DataTableColumnHeader title="Queue" icon={<Layers size={16} />} />,
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono text-xs">
          {row.original.queueName}
        </Badge>
      ),
    },
    {
      id: 'status',
      header: () => <DataTableColumnHeader title="Status" icon={<Activity size={16} />} />,
      cell: () => {
        const config = statusConfig[selectedStatus];
        const StatusIcon = config.icon;

        return (
          <Badge variant={config.variant} className="gap-1">
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'attemptsMade',
      header: () => <DataTableColumnHeader title="Attempts" icon={<RefreshCw size={16} />} />,
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">{row.original.attemptsMade}</div>
      ),
    },
    {
      accessorKey: 'timestamp',
      header: () => <DataTableColumnHeader title="Created" icon={<Clock size={16} />} />,
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.timestamp), { addSuffix: true })}
        </div>
      ),
    },
    {
      accessorKey: 'failedReason',
      header: 'Error',
      cell: ({ row }) => {
        const reason = row.original.failedReason;
        if (!reason) return <span className="text-muted-foreground">-</span>;

        return (
          <div className="max-w-[300px] truncate text-sm text-destructive" title={reason}>
            {reason}
          </div>
        );
      },
    },
  ];
}
