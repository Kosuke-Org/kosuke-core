'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RowSelectionState } from '@tanstack/react-table';

import { useToast } from '@/hooks/use-toast';
import { useTableSearch } from '@/hooks/table/use-table-search';
import { useTablePagination } from '@/hooks/table/use-table-pagination';

import { Skeleton } from '@/components/ui/skeleton';
import type { AdminOrganization, OrganizationStats } from '@/lib/types';

import { OrganizationsStats } from './components/organizations-stats';
import { OrganizationsDataTable } from './components/organizations-data-table';

interface OrganizationsResponse {
  organizations: AdminOrganization[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [selectedType, setSelectedType] = useState<'personal' | 'team' | undefined>();

  // Reusable table hooks
  const { debouncedValue: searchQuery, setSearchValue } = useTableSearch({
    initialValue: '',
    debounceMs: 300,
  });

  const { page, pageSize, setPage, setPageSize, goToFirstPage } = useTablePagination({
    initialPage: 1,
    initialPageSize: 10,
  });

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Fetch statistics
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['admin-organizations-stats'],
    queryFn: async (): Promise<OrganizationStats> => {
      const response = await fetch('/api/admin/organizations/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const result = await response.json();
      return result.data;
    },
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Fetch organizations
  const { data, isLoading: isLoadingOrgs } = useQuery<OrganizationsResponse>({
    queryKey: ['admin-organizations', searchQuery, selectedType, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (selectedType) params.set('type', selectedType);
      params.set('page', page.toString());
      params.set('limit', pageSize.toString());
      params.set('sortBy', 'createdAt');
      params.set('sortOrder', 'desc');

      const response = await fetch(`/api/admin/organizations?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch organizations');

      const result = await response.json();
      return result.data;
    },
    staleTime: 1000 * 30, // 30 seconds
  });

  const isLoading = isLoadingStats || isLoadingOrgs;

  const handleClearFilters = () => {
    setSelectedType(undefined);
    goToFirstPage();
  };

  const handleViewClick = (id: string) => {
    router.push(`/admin/organizations/${id}`);
  };

  const handleBlockClick = (id: string) => {
    toast({
      title: 'Block Organization',
      description: `Block action for organization ${id} (placeholder - not implemented)`,
    });
  };

  const handleBulkBlock = (ids: string[]) => {
    toast({
      title: 'Bulk Block',
      description: `Block action for ${ids.length} organization(s) (placeholder - not implemented)`,
    });
    setRowSelection({});
  };

  if (isLoading && page === 1) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
        <p className="text-muted-foreground mt-2">
          Manage organizations and monitor LLM usage metrics
        </p>
      </div>

      {/* Statistics */}
      {stats && <OrganizationsStats stats={stats} />}

      {/* Organizations DataTable */}
      <OrganizationsDataTable
        organizations={data?.organizations || []}
        total={data?.total || 0}
        page={page}
        pageSize={pageSize}
        totalPages={data?.totalPages || 0}
        isLoading={isLoadingOrgs}
        searchQuery={searchQuery}
        selectedType={selectedType}
        onSearchChange={setSearchValue}
        onTypeChange={type => {
          setSelectedType(type);
          goToFirstPage();
        }}
        onClearFilters={handleClearFilters}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onView={handleViewClick}
        onBlock={handleBlockClick}
        selectedRowIds={rowSelection}
        onRowSelectionChange={setRowSelection}
        onBulkBlock={handleBulkBlock}
      />
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

      {/* Stats skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg border p-6">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32 mb-1" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
