'use client';

import {
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from '@tanstack/react-table';
import { useState } from 'react';

import { DataTablePagination } from '@/app/(admin)/admin/components/data-table-pagination';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdminOrganization } from '@/lib/types';

import { createOrganizationsColumns } from './organizations-columns';
import { OrganizationsFilters } from './organizations-filters';

interface OrganizationsDataTableProps {
  organizations: AdminOrganization[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  searchQuery: string;
  selectedType?: 'personal' | 'team';
  onSearchChange: (search: string) => void;
  onTypeChange: (type: 'personal' | 'team' | undefined) => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onView: (id: string) => void;
}

export function OrganizationsDataTable({
  organizations,
  total,
  page: _page,
  pageSize: _pageSize,
  totalPages,
  isLoading,
  searchQuery,
  selectedType,
  onSearchChange,
  onTypeChange,
  onClearFilters,
  onPageChange,
  onPageSizeChange,
  onView,
}: OrganizationsDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = createOrganizationsColumns({ onView });

  const table = useReactTable({
    data: organizations,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  const hasActiveFilters = !!selectedType;

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search organizations..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="max-w-sm"
        />
        <OrganizationsFilters
          selectedType={selectedType}
          onTypeChange={onTypeChange}
          onRefresh={handleRefresh}
          onClearFilters={onClearFilters}
          hasActiveFilters={hasActiveFilters}
        />
      </div>

      {/* Table */}
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
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
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
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No organizations found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <DataTablePagination
        table={table as unknown as ReturnType<typeof useReactTable<unknown>>}
        totalRecords={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
