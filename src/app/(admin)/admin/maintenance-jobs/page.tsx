'use client';

import { useQuery } from '@tanstack/react-query';

import { useTableFilters } from '@/hooks/table/use-table-filters';
import { useTablePagination } from '@/hooks/table/use-table-pagination';
import { useTableSorting } from '@/hooks/table/use-table-sorting';
import { Skeleton } from '@/components/ui/skeleton';

import { MaintenanceJobsDataTable } from './components/maintenance-jobs-data-table';
import { TriggerMaintenanceJobDialog } from './components/trigger-maintenance-job-dialog';
import type { AdminMaintenanceJobRun } from './components/maintenance-jobs-columns';

interface MaintenanceJobsResponse {
  runs: AdminMaintenanceJobRun[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}

export default function AdminMaintenanceJobsPage() {
  const { sortBy, sortOrder, handleSort } = useTableSorting<
    'createdAt' | 'startedAt' | 'completedAt'
  >({
    initialSortBy: 'createdAt',
    initialSortOrder: 'desc',
  });

  const { page, pageSize, setPage, setPageSize, goToFirstPage } = useTablePagination({
    initialPage: 1,
    initialPageSize: 10,
  });

  const { filters, updateFilter, resetFilters } = useTableFilters({
    selectedJobTypes: [] as string[],
    selectedStatuses: [] as string[],
    dateFrom: undefined as Date | undefined,
    dateTo: undefined as Date | undefined,
  });

  const { data, isLoading } = useQuery<{ data: MaintenanceJobsResponse }>({
    queryKey: [
      'admin-maintenance-jobs',
      filters.selectedJobTypes,
      filters.selectedStatuses,
      filters.dateFrom,
      filters.dateTo,
      page,
      pageSize,
      sortBy,
      sortOrder,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters.selectedJobTypes.length > 0) {
        params.set('jobType', filters.selectedJobTypes[0]);
      }
      if (filters.selectedStatuses.length > 0) {
        params.set('status', filters.selectedStatuses[0]);
      }
      if (filters.dateFrom) {
        params.set('dateFrom', filters.dateFrom.toISOString());
      }
      if (filters.dateTo) {
        params.set('dateTo', filters.dateTo.toISOString());
      }
      params.set('page', page.toString());
      params.set('limit', pageSize.toString());
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const response = await fetch(`/api/admin/maintenance-jobs?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch maintenance jobs');

      return response.json();
    },
    staleTime: 1000 * 30,
  });

  const handleClearFilters = () => {
    resetFilters();
    goToFirstPage();
  };

  if (isLoading && page === 1) {
    return <PageSkeleton />;
  }

  const responseData = data?.data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Maintenance Jobs</h1>
          <p className="text-muted-foreground mt-2">
            Monitor maintenance job runs across all projects
          </p>
        </div>
        <TriggerMaintenanceJobDialog />
      </div>

      <MaintenanceJobsDataTable
        runs={responseData?.runs || []}
        total={responseData?.total || 0}
        page={page}
        pageSize={pageSize}
        totalPages={responseData?.totalPages || 0}
        isLoading={isLoading}
        selectedJobTypes={filters.selectedJobTypes}
        selectedStatuses={filters.selectedStatuses}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onJobTypesChange={types => {
          updateFilter('selectedJobTypes', types);
          goToFirstPage();
        }}
        onStatusesChange={statuses => {
          updateFilter('selectedStatuses', statuses);
          goToFirstPage();
        }}
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
      />
    </div>
  );
}
