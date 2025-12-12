'use client';

import {
  RowSelectionState,
  Updater,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Search, Trash2, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ActiveFilterBadges, ProjectFilters } from './project-filters';
import { getProjectColumns, type AdminProject } from './projects-columns';

interface ProjectsDataTableProps {
  projects: AdminProject[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  // Filter props
  searchQuery: string;
  dateFrom?: Date;
  dateTo?: Date;
  // Sorting props
  sortBy: 'name' | 'createdAt';
  sortOrder: 'asc' | 'desc';
  onSearchChange: (query: string) => void;
  onDateFromChange: (date?: Date) => void;
  onDateToChange: (date?: Date) => void;
  onClearFilters: () => void;
  onSortChange: (column: 'name' | 'createdAt') => void;
  // Pagination handlers
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  // Action handlers
  onView: (id: string) => void;
  onDelete: (id: string) => void;
  // Row selection props
  selectedRowIds?: string[];
  onRowSelectionChange?: (selectedRowIds: string[]) => void;
  onBulkDelete?: (selectedRowIds: string[]) => void;
}

export function ProjectsDataTable({
  projects,
  total,
  page,
  pageSize,
  totalPages,
  isLoading,
  searchQuery,
  dateFrom,
  dateTo,
  sortBy,
  sortOrder,
  onSearchChange,
  onDateFromChange,
  onDateToChange,
  onClearFilters,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onView,
  onDelete,
  selectedRowIds = [],
  onRowSelectionChange,
  onBulkDelete,
}: ProjectsDataTableProps) {
  const rowSelection = useMemo(() => {
    const newRowSelection: Record<string, boolean> = {};
    selectedRowIds.forEach(id => {
      newRowSelection[id] = true;
    });
    return newRowSelection;
  }, [selectedRowIds]);

  const handleRowSelectionChange = useCallback(
    (updaterOrValue: Updater<RowSelectionState>) => {
      const newRowSelection =
        typeof updaterOrValue === 'function' ? updaterOrValue(rowSelection) : updaterOrValue;

      const selectedIds = Object.keys(newRowSelection).filter(key => newRowSelection[key]);
      onRowSelectionChange?.(selectedIds);
    },
    [rowSelection, onRowSelectionChange]
  );

  const columns = useMemo(
    () => getProjectColumns({ onView, onDelete }, { sortBy, sortOrder, onSort: onSortChange }),
    [onView, onDelete, sortBy, sortOrder, onSortChange]
  );

  const table = useReactTable({
    data: projects,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
    enableRowSelection: true,
    getRowId: row => row.id,
    onRowSelectionChange: handleRowSelectionChange,
    state: {
      pagination: {
        pageIndex: page - 1,
        pageSize,
      },
      rowSelection,
    },
  });

  const activeFiltersCount = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const hasSelectedRows = selectedRows.length > 0;

  return (
    <>
      {/* Bulk Actions Bar */}
      {hasSelectedRows && (
        <div className="bg-muted/50 flex items-center gap-2 rounded-md border p-3">
          <span className="text-sm font-medium">
            {selectedRows.length} row{selectedRows.length > 1 ? 's' : ''} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            {onBulkDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onBulkDelete(selectedRows.map(row => row.original.id))}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative w-full sm:w-[400px] lg:w-[500px]">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search by project name or description..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <ProjectFilters
          activeFiltersCount={activeFiltersCount}
          dateFrom={dateFrom}
          dateTo={dateTo}
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
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={onDateFromChange}
        onDateToChange={onDateToChange}
      />

      {isLoading ? (
        <TableSkeleton />
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="mb-1 text-lg font-semibold">No projects found</h3>
          <p className="text-muted-foreground text-sm">
            {searchQuery || activeFiltersCount > 0
              ? 'Try adjusting your filters'
              : 'No projects available'}
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
                          target.closest('[role="checkbox"]') ||
                          target.closest('[role="menuitem"]') ||
                          target.closest('button')
                        ) {
                          return;
                        }
                        onView(row.original.id);
                      }}
                    >
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id} className="py-1.5">
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
