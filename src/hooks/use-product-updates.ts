'use client';

import type { ProductUpdateWithReadStatus } from '@/lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  };
}

interface ApiResponse<T> {
  data: T;
}

export function useProductUpdates(page = 1, pageSize = 20) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['product-updates', page, pageSize],
    queryFn: async (): Promise<PaginatedResponse<ProductUpdateWithReadStatus>> => {
      const response = await fetch(`/api/product-updates?page=${page}&pageSize=${pageSize}`);
      if (!response.ok) {
        throw new Error('Failed to fetch product updates');
      }
      return response.json();
    },
    staleTime: 1000 * 60, // 1 minute
  });

  const markReadMutation = useMutation({
    mutationFn: async (updateId: string): Promise<{ marked: boolean }> => {
      const response = await fetch(`/api/product-updates/${updateId}/mark-read`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to mark product update as read');
      }
      const data: ApiResponse<{ marked: boolean }> = await response.json();
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-updates'] });
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
    },
  });

  return {
    updates: data?.data ?? [],
    pagination: data?.meta?.pagination,
    isLoading,
    error,
    refetch,
    markAsRead: markReadMutation.mutate,
    isMarkingRead: markReadMutation.isPending,
  };
}
