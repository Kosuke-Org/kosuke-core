'use client';

import type { Notification, UnreadCounts } from '@/lib/types';
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

export function useNotifications(page = 1, pageSize = 20) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications', page, pageSize],
    queryFn: async (): Promise<PaginatedResponse<Notification>> => {
      const response = await fetch(`/api/notifications?page=${page}&pageSize=${pageSize}`);
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      return response.json();
    },
    staleTime: 1000 * 60, // 1 minute
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationIds: string[]): Promise<{ updated: number }> => {
      const response = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds }),
      });
      if (!response.ok) {
        throw new Error('Failed to mark notifications as read');
      }
      const data: ApiResponse<{ updated: number }> = await response.json();
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async (): Promise<{ updated: number }> => {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to mark all notifications as read');
      }
      const data: ApiResponse<{ updated: number }> = await response.json();
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
    },
  });

  return {
    notifications: data?.data ?? [],
    pagination: data?.meta?.pagination,
    isLoading,
    error,
    refetch,
    markAsRead: markReadMutation.mutate,
    markAllAsRead: markAllReadMutation.mutate,
    isMarkingRead: markReadMutation.isPending,
    isMarkingAllRead: markAllReadMutation.isPending,
  };
}

export function useUnreadCounts() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['unread-counts'],
    queryFn: async (): Promise<UnreadCounts> => {
      const response = await fetch('/api/notifications/unread-count');
      if (!response.ok) {
        throw new Error('Failed to fetch unread counts');
      }
      const data: ApiResponse<UnreadCounts> = await response.json();
      return data.data;
    },
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Refetch every minute
  });

  return {
    counts: data ?? { notifications: 0, productUpdates: 0, total: 0 },
    isLoading,
    error,
    refetch,
  };
}
