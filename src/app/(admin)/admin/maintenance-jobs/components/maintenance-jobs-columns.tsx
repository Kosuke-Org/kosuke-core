'use client';

import { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import {
  Calendar,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  MoreHorizontal,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '../../components/data-table-column-header';

export interface AdminMaintenanceJobRun {
  id: string;
  maintenanceJobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  summary: string | null;
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  createdAt: Date;
  jobType: 'sync_rules' | 'analyze' | 'security_check';
  projectId: string;
  projectName: string | null;
}

interface ColumnActionsProps {
  onView: (run: AdminMaintenanceJobRun) => void;
}

interface ColumnSortingProps {
  sortBy: 'createdAt' | 'startedAt' | 'completedAt';
  sortOrder: 'asc' | 'desc';
  onSort: (column: 'createdAt' | 'startedAt' | 'completedAt') => void;
}

export function getMaintenanceJobColumns(
  actions: ColumnActionsProps,
  sorting: ColumnSortingProps
): ColumnDef<AdminMaintenanceJobRun>[] {
  const { onView } = actions;
  const { sortBy, sortOrder, onSort } = sorting;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'running':
        return (
          <Badge variant="default" className="gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            Running
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="outline" className="border-green-500 text-green-500">
            Completed
          </Badge>
        );
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getJobTypeBadge = (jobType: string) => {
    switch (jobType) {
      case 'sync_rules':
        return <Badge variant="outline">Sync Rules</Badge>;
      case 'analyze':
        return <Badge variant="outline">Analyze</Badge>;
      case 'security_check':
        return <Badge variant="outline">Security Check</Badge>;
      default:
        return <Badge variant="outline">{jobType}</Badge>;
    }
  };

  return [
    {
      accessorKey: 'projectName',
      header: () => <DataTableColumnHeader title="Project" icon={<FolderOpen size={16} />} />,
      cell: ({ row }) => (
        <div className="text-sm font-medium">
          {row.original.projectName || <span className="text-muted-foreground">Unknown</span>}
        </div>
      ),
    },
    {
      accessorKey: 'jobType',
      header: () => <DataTableColumnHeader title="Job Type" icon={<FileText size={16} />} />,
      cell: ({ row }) => getJobTypeBadge(row.original.jobType),
    },
    {
      accessorKey: 'status',
      header: () => <DataTableColumnHeader title="Status" />,
      cell: ({ row }) => getStatusBadge(row.original.status),
    },
    {
      accessorKey: 'createdAt',
      header: () => (
        <DataTableColumnHeader
          title="Created"
          icon={<Calendar size={16} />}
          sortable
          sortDirection={sortBy === 'createdAt' ? sortOrder : false}
          onSort={() => onSort('createdAt')}
        />
      ),
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
        </div>
      ),
    },
    {
      accessorKey: 'startedAt',
      header: () => (
        <DataTableColumnHeader
          title="Started"
          icon={<Clock size={16} />}
          sortable
          sortDirection={sortBy === 'startedAt' ? sortOrder : false}
          onSort={() => onSort('startedAt')}
        />
      ),
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {row.original.startedAt
            ? formatDistanceToNow(new Date(row.original.startedAt), { addSuffix: true })
            : '-'}
        </div>
      ),
    },
    {
      accessorKey: 'completedAt',
      header: () => (
        <DataTableColumnHeader
          title="Completed"
          icon={<Clock size={16} />}
          sortable
          sortDirection={sortBy === 'completedAt' ? sortOrder : false}
          onSort={() => onSort('completedAt')}
        />
      ),
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {row.original.completedAt
            ? formatDistanceToNow(new Date(row.original.completedAt), { addSuffix: true })
            : '-'}
        </div>
      ),
    },
    {
      accessorKey: 'pullRequestUrl',
      header: () => <DataTableColumnHeader title="PR" />,
      cell: ({ row }) =>
        row.original.pullRequestUrl ? (
          <a
            href={row.original.pullRequestUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
            onClick={e => e.stopPropagation()}
          >
            #{row.original.pullRequestNumber}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const run = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={e => e.stopPropagation()}>
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={e => {
                  e.stopPropagation();
                  onView(run);
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
