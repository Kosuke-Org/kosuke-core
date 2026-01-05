'use client';

import { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Calendar, Clock, Layers, Tag } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { SchedulerWithQueue } from '@/lib/types';

import { DataTableColumnHeader } from '../../components/data-table-column-header';

/**
 * Format interval in milliseconds to human readable string
 */
function formatInterval(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `Every ${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `Every ${minutes} min`;
  return `Every ${seconds} sec`;
}

export function getCronColumns(): ColumnDef<SchedulerWithQueue>[] {
  return [
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
      id: 'schedule',
      header: () => <DataTableColumnHeader title="Schedule" icon={<Clock size={16} />} />,
      cell: ({ row }) => {
        const { pattern, every } = row.original;

        if (pattern) {
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">Cron</span>
              <code className="text-xs text-muted-foreground">{pattern}</code>
            </div>
          );
        }

        if (every) {
          return <span className="text-sm">{formatInterval(every)}</span>;
        }

        return <span className="text-sm text-muted-foreground">No schedule</span>;
      },
    },
    {
      accessorKey: 'nextRun',
      header: () => <DataTableColumnHeader title="Next Run" icon={<Calendar size={16} />} />,
      cell: ({ row }) => {
        const nextRun = row.original.nextRun;

        if (!nextRun) {
          return <span className="text-sm text-muted-foreground">-</span>;
        }

        return (
          <Badge variant="secondary" className="text-xs">
            {formatDistanceToNow(new Date(nextRun), { addSuffix: true })}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'lastRun',
      header: () => <DataTableColumnHeader title="Last Run" icon={<Clock size={16} />} />,
      cell: ({ row }) => {
        const lastRun = row.original.lastRun;

        if (!lastRun) {
          return <span className="text-sm text-muted-foreground">Never</span>;
        }

        return (
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(lastRun), { addSuffix: true })}
          </span>
        );
      },
    },
  ];
}
