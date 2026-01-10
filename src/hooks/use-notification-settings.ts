'use client';

import { useToast } from '@/hooks/use-toast';
import type { UpdateNotificationSettingsPayload } from '@/lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface NotificationSettings {
  emailNotifications: boolean;
  projectUpdates: boolean;
  productUpdates: boolean;
}

interface ApiResponse<T> {
  data: T;
}

export function useNotificationSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: settings,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: async (): Promise<NotificationSettings> => {
      const response = await fetch('/api/user/notification-settings');
      if (!response.ok) {
        throw new Error('Failed to fetch notification settings');
      }
      const data: ApiResponse<NotificationSettings> = await response.json();
      return data.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const updateMutation = useMutation({
    mutationFn: async (
      payload: UpdateNotificationSettingsPayload
    ): Promise<NotificationSettings> => {
      const response = await fetch('/api/user/notification-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to update notification settings');
      }

      const data: ApiResponse<NotificationSettings> = await response.json();
      return data.data;
    },
    onSuccess: data => {
      queryClient.setQueryData(['notification-settings'], data);
      toast({
        title: 'Settings updated',
        description: 'Your notification preferences have been saved.',
      });
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update settings',
        variant: 'destructive',
      });
    },
  });

  return {
    settings,
    isLoading,
    error,
    refetch,
    updateSettings: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
}
