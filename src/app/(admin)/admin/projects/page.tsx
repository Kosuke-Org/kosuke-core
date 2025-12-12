'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/hooks/use-toast';
import { useTableSearch } from '@/hooks/table/use-table-search';
import { useTableFilters } from '@/hooks/table/use-table-filters';
import { useTableSorting } from '@/hooks/table/use-table-sorting';
import { useTablePagination } from '@/hooks/table/use-table-pagination';
import { useTableRowSelection } from '@/hooks/table/use-table-row-selection';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';

import { ProjectsDataTable } from './components/projects-data-table';
import type { AdminProject } from './components/projects-columns';

interface ProjectsResponse {
  projects: AdminProject[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AdminProjectsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Reusable table hooks
  const { debouncedValue: searchQuery, setSearchValue } = useTableSearch({
    initialValue: '',
    debounceMs: 300,
  });

  const { sortBy, sortOrder, handleSort } = useTableSorting<'name' | 'createdAt'>({
    initialSortBy: 'createdAt',
    initialSortOrder: 'desc',
  });

  const { page, pageSize, setPage, setPageSize, goToFirstPage } = useTablePagination({
    initialPage: 1,
    initialPageSize: 10,
  });

  const { filters, updateFilter, resetFilters } = useTableFilters({
    dateFrom: undefined as Date | undefined,
    dateTo: undefined as Date | undefined,
  });

  const rowSelection = useTableRowSelection();

  // Fetch projects with filters
  const { data, isLoading } = useQuery<ProjectsResponse>({
    queryKey: [
      'admin-projects',
      searchQuery,
      filters.dateFrom,
      filters.dateTo,
      page,
      pageSize,
      sortBy,
      sortOrder,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom.toISOString());
      if (filters.dateTo) params.set('dateTo', filters.dateTo.toISOString());
      params.set('page', page.toString());
      params.set('limit', pageSize.toString());
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const response = await fetch(`/api/admin/projects?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch projects');

      const result = await response.json();
      return result.data;
    },
    staleTime: 1000 * 30, // 30 seconds
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await fetch(`/api/admin/projects/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', projectIds: [projectId] }),
      });
      if (!response.ok) throw new Error('Failed to delete project');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
      toast({ title: 'Success', description: 'Project deleted successfully' });
      setDeleteDialogOpen(false);
      setSelectedProjectId(null);
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete project',
        variant: 'destructive',
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (projectIds: string[]) => {
      const response = await fetch(`/api/admin/projects/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', projectIds }),
      });
      if (!response.ok) throw new Error('Failed to delete projects');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
      toast({ title: 'Success', description: 'Projects deleted successfully' });
      rowSelection.clearSelection();
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete projects',
        variant: 'destructive',
      });
    },
  });

  const handleClearFilters = () => {
    resetFilters();
    goToFirstPage();
  };

  const handleViewClick = (id: string) => {
    router.push(`/admin/projects/${id}`);
  };

  const handleDeleteClick = (id: string) => {
    setSelectedProjectId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteProject = async () => {
    if (!selectedProjectId) return;
    await deleteProjectMutation.mutateAsync(selectedProjectId);
  };

  if (isLoading && page === 1) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <p className="text-muted-foreground mt-2">Manage projects across all organizations</p>
      </div>

      {/* Projects DataTable */}
      <ProjectsDataTable
        projects={data?.projects || []}
        total={data?.total || 0}
        page={page}
        pageSize={pageSize}
        totalPages={data?.totalPages || 0}
        isLoading={isLoading}
        searchQuery={searchQuery}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSearchChange={setSearchValue}
        onDateFromChange={date => {
          updateFilter('dateFrom', date);
          goToFirstPage();
        }}
        onDateToChange={date => {
          updateFilter('dateTo', date);
          goToFirstPage();
        }}
        onClearFilters={handleClearFilters}
        onSortChange={handleSort}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onView={handleViewClick}
        onDelete={handleDeleteClick}
        selectedRowIds={rowSelection.selectedRowIds}
        onRowSelectionChange={rowSelection.setSelectedRowIds}
        onBulkDelete={ids => bulkDeleteMutation.mutate(ids)}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this project and all associated data. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProjectMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              disabled={deleteProjectMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProjectMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
