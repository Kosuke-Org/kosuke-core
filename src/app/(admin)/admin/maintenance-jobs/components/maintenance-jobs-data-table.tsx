'use client';

import { useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { DataTablePagination } from '../../components/data-table-pagination';
import { ActiveFilterBadges, MaintenanceJobsFilters } from './maintenance-jobs-filters';
import { getMaintenanceJobColumns, type AdminMaintenanceJobRun } from './maintenance-jobs-columns';

interface MaintenanceJobsDataTableProps {
  runs: AdminMaintenanceJobRun[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  // Filter props
  selectedJobTypes: string[];
  selectedStatuses: string[];
  dateFrom?: Date;
  dateTo?: Date;
  // Sorting props
  sortBy: 'createdAt' | 'startedAt' | 'completedAt';
  sortOrder: 'asc' | 'desc';
  onJobTypesChange: (types: string[]) => void;
  onStatusesChange: (statuses: string[]) => void;
  onDateFromChange: (date?: Date) => void;
  onDateToChange: (date?: Date) => void;
  onClearFilters: () => void;
  onSortChange: (column: 'createdAt' | 'startedAt' | 'completedAt') => void;
  // Pagination handlers
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function MaintenanceJobsDataTable({
  runs,
  total,
  page,
  pageSize,
  totalPages,
  isLoading,
  selectedJobTypes,
  selectedStatuses,
  dateFrom,
  dateTo,
  sortBy,
  sortOrder,
  onJobTypesChange,
  onStatusesChange,
  onDateFromChange,
  onDateToChange,
  onClearFilters,
  onSortChange,
  onPageChange,
  onPageSizeChange,
}: MaintenanceJobsDataTableProps) {
  const [selectedRun, setSelectedRun] = useState<AdminMaintenanceJobRun | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleView = (run: AdminMaintenanceJobRun) => {
    setSelectedRun(run);
    setDetailsOpen(true);
  };

  const columns = useMemo(
    () =>
      getMaintenanceJobColumns({ onView: handleView }, { sortBy, sortOrder, onSort: onSortChange }),
    [sortBy, sortOrder, onSortChange]
  );

  const table = useReactTable({
    data: runs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
    getRowId: row => row.id,
    state: {
      pagination: {
        pageIndex: page - 1,
        pageSize,
      },
    },
  });

  const activeFiltersCount =
    selectedJobTypes.length + selectedStatuses.length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  return (
    <>
      <div className="flex items-center gap-3">
        <MaintenanceJobsFilters
          activeFiltersCount={activeFiltersCount}
          selectedJobTypes={selectedJobTypes}
          selectedStatuses={selectedStatuses}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onJobTypesChange={onJobTypesChange}
          onStatusesChange={onStatusesChange}
          onDateFromChange={onDateFromChange}
          onDateToChange={onDateToChange}
        />
        {activeFiltersCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X />
            Clear all
          </Button>
        )}
      </div>

      {/* Active Filters Badges */}
      <ActiveFilterBadges
        selectedJobTypes={selectedJobTypes}
        selectedStatuses={selectedStatuses}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onJobTypesChange={onJobTypesChange}
        onStatusesChange={onStatusesChange}
        onDateFromChange={onDateFromChange}
        onDateToChange={onDateToChange}
      />

      {isLoading ? (
        <TableSkeleton />
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="mb-1 text-lg font-semibold">No maintenance job runs found</h3>
          <p className="text-muted-foreground text-sm">
            {activeFiltersCount > 0
              ? 'Try adjusting your filters'
              : 'No maintenance jobs have been run yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map(headerGroup => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map(header => {
                      return (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map(row => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={e => {
                        const target = e.target as HTMLElement;
                        if (
                          target.closest('[role="menuitem"]') ||
                          target.closest('button') ||
                          target.closest('a')
                        ) {
                          return;
                        }
                        handleView(row.original);
                      }}
                    >
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}
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
      )}

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Job Run Details</DialogTitle>
            <DialogDescription>Details for maintenance job run</DialogDescription>
          </DialogHeader>
          {selectedRun && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Project</p>
                  <p className="font-medium">{selectedRun.projectName || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Job Type</p>
                  <p className="font-medium capitalize">{selectedRun.jobType.replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{selectedRun.status}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{new Date(selectedRun.createdAt).toLocaleString()}</p>
                </div>
                {selectedRun.startedAt && (
                  <div>
                    <p className="text-muted-foreground">Started</p>
                    <p className="font-medium">
                      {new Date(selectedRun.startedAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {selectedRun.completedAt && (
                  <div>
                    <p className="text-muted-foreground">Completed</p>
                    <p className="font-medium">
                      {new Date(selectedRun.completedAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {selectedRun.pullRequestUrl && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Pull Request</p>
                    <a
                      href={selectedRun.pullRequestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      #{selectedRun.pullRequestNumber}
                    </a>
                  </div>
                )}
              </div>
              {selectedRun.summary && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Summary</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">
                    {selectedRun.summary}
                  </p>
                </div>
              )}
              {selectedRun.error && (
                <div>
                  <p className="text-destructive text-sm mb-1">Error</p>
                  <p className="text-sm whitespace-pre-wrap bg-destructive/10 text-destructive p-3 rounded-md">
                    {selectedRun.error}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
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
