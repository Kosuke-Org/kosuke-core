'use client';

import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useMemo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { JobDetailsWithQueue, JobStatus } from '@/lib/types';

import { DataTablePagination } from '../../components/data-table-pagination';
import { getJobsColumns } from './jobs-columns';

interface JobsDataTableProps {
  jobs: JobDetailsWithQueue[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  selectedStatus: JobStatus;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function JobsDataTable({
  jobs,
  total,
  page,
  pageSize,
  totalPages,
  isLoading,
  selectedStatus,
  onPageChange,
  onPageSizeChange,
}: JobsDataTableProps) {
  const columns = useMemo(() => getJobsColumns({ selectedStatus }), [selectedStatus]);

  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
    getRowId: row => row.id,
    state: {
      pagination: {
        pageIndex: page - 1,
        pageSize,
      },
    },
  });

  if (isLoading) {
    return <TableSkeleton />;
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <h3 className="mb-1 text-lg font-semibold">No {selectedStatus} jobs</h3>
        <p className="text-muted-foreground text-sm">No jobs found with this status</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
                  <TableCell key={cell.id} className="py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        table={table}
        totalRecords={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
