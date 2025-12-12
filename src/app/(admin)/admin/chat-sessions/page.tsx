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

import { ChatSessionsDataTable } from './components/chat-sessions-data-table';
import type { AdminChatSession } from './components/chat-sessions-columns';

interface ChatSessionsResponse {
  chatSessions: AdminChatSession[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AdminChatSessionsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Reusable table hooks
  const { debouncedValue: searchQuery, setSearchValue } = useTableSearch({
    initialValue: '',
    debounceMs: 300,
  });

  const { sortBy, sortOrder, handleSort } = useTableSorting<
    'title' | 'lastActivityAt' | 'messageCount' | 'createdAt'
  >({
    initialSortBy: 'lastActivityAt',
    initialSortOrder: 'desc',
  });

  const { page, pageSize, setPage, setPageSize, goToFirstPage } = useTablePagination({
    initialPage: 1,
    initialPageSize: 10,
  });

  const { filters, updateFilter, resetFilters } = useTableFilters({
    selectedStatuses: [] as string[],
    dateFrom: undefined as Date | undefined,
    dateTo: undefined as Date | undefined,
  });

  const rowSelection = useTableRowSelection();

  // Fetch chat sessions with filters
  const { data, isLoading } = useQuery<ChatSessionsResponse>({
    queryKey: [
      'admin-chat-sessions',
      searchQuery,
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
      if (searchQuery) params.set('search', searchQuery);
      if (filters.selectedStatuses.length > 0) {
        params.set('status', filters.selectedStatuses[0]);
      }
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom.toISOString());
      if (filters.dateTo) params.set('dateTo', filters.dateTo.toISOString());
      params.set('page', page.toString());
      params.set('limit', pageSize.toString());
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const response = await fetch(`/api/admin/chat-sessions?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch chat sessions');

      const result = await response.json();
      return result.data;
    },
    staleTime: 1000 * 30, // 30 seconds
  });

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch(`/api/admin/chat-sessions/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', sessionIds: [sessionId] }),
      });
      if (!response.ok) throw new Error('Failed to delete chat session');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-chat-sessions'] });
      toast({ title: 'Success', description: 'Chat session deleted successfully' });
      setDeleteDialogOpen(false);
      setSelectedSessionId(null);
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete chat session',
        variant: 'destructive',
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (sessionIds: string[]) => {
      const response = await fetch(`/api/admin/chat-sessions/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', sessionIds }),
      });
      if (!response.ok) throw new Error('Failed to delete chat sessions');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-chat-sessions'] });
      toast({ title: 'Success', description: 'Chat sessions deleted successfully' });
      rowSelection.clearSelection();
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete chat sessions',
        variant: 'destructive',
      });
    },
  });

  // Bulk archive mutation
  const bulkArchiveMutation = useMutation({
    mutationFn: async (sessionIds: string[]) => {
      const response = await fetch(`/api/admin/chat-sessions/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', sessionIds }),
      });
      if (!response.ok) throw new Error('Failed to archive chat sessions');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-chat-sessions'] });
      toast({ title: 'Success', description: 'Chat sessions archived successfully' });
      rowSelection.clearSelection();
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to archive chat sessions',
        variant: 'destructive',
      });
    },
  });

  const handleClearFilters = () => {
    resetFilters();
    goToFirstPage();
  };

  const handleViewClick = (id: string) => {
    router.push(`/admin/chat-sessions/${id}`);
  };

  const handleDeleteClick = (id: string) => {
    setSelectedSessionId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSession = async () => {
    if (!selectedSessionId) return;
    await deleteSessionMutation.mutateAsync(selectedSessionId);
  };

  if (isLoading && page === 1) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Chat Sessions</h1>
        <p className="text-muted-foreground mt-2">Manage chat sessions across all projects</p>
      </div>

      {/* Chat Sessions DataTable */}
      <ChatSessionsDataTable
        chatSessions={data?.chatSessions || []}
        total={data?.total || 0}
        page={page}
        pageSize={pageSize}
        totalPages={data?.totalPages || 0}
        isLoading={isLoading}
        searchQuery={searchQuery}
        selectedStatuses={filters.selectedStatuses}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSearchChange={setSearchValue}
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
        onView={handleViewClick}
        onDelete={handleDeleteClick}
        selectedRowIds={rowSelection.selectedRowIds}
        onRowSelectionChange={rowSelection.setSelectedRowIds}
        onBulkDelete={ids => bulkDeleteMutation.mutate(ids)}
        onBulkArchive={ids => bulkArchiveMutation.mutate(ids)}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this chat session and all associated messages. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSessionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSession}
              disabled={deleteSessionMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSessionMutation.isPending ? 'Deleting...' : 'Delete'}
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
