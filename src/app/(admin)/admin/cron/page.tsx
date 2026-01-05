'use client';

import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { RefreshCw } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSchedulers } from '@/hooks/use-admin-jobs';

import { getCronColumns } from './components/cron-columns';

export default function AdminCronPage() {
  const { data, isLoading, refetch } = useSchedulers();

  const columns = useMemo(() => getCronColumns(), []);

  const schedulers = data?.schedulers || [];

  const table = useReactTable({
    data: schedulers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: row => row.id,
  });

  if (isLoading && !data) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cron Jobs</h1>
          <p className="text-muted-foreground mt-2">
            View scheduled/recurring jobs across all queues
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Table */}
      {schedulers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="mb-1 text-lg font-semibold">No scheduled jobs</h3>
          <p className="text-muted-foreground text-sm">
            No cron jobs or recurring schedulers are configured
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map(row => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Summary */}
      {schedulers.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {schedulers.length} scheduled job{schedulers.length !== 1 ? 's' : ''} configured
        </p>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-9 w-40 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
