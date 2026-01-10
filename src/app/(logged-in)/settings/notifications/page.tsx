'use client';

import { useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useNotificationSettings } from '@/hooks/use-notification-settings';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';

function NotificationsSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Notifications</CardTitle>
          <CardDescription>Loading notification preferences...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start justify-between space-x-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-6 w-11 rounded-full mt-0.5 shrink-0" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between space-x-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-6 w-11 rounded-full mt-0.5 shrink-0" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NotificationsPage() {
  const { user, isLoading: isUserLoading, refresh } = useUser();
  const {
    settings,
    isLoading: isSettingsLoading,
    updateSettings,
    isUpdating,
  } = useNotificationSettings();
  const { toast } = useToast();
  const [isSubmittingMarketing, setIsSubmittingMarketing] = useState(false);

  // Handle marketing emails toggle (Clerk)
  const handleMarketingToggle = async (checked: boolean) => {
    if (!user) return;

    setIsSubmittingMarketing(true);

    try {
      const response = await fetch('/api/user/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketingEmails: checked }),
      });

      const result = await response.json();

      if (response.ok) {
        await refresh();
        toast({
          title: 'Success',
          description: result.success || 'Marketing preference updated',
        });
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to update preference',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving marketing preference:', error);
      toast({
        title: 'Error',
        description: 'Failed to update preference',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingMarketing(false);
    }
  };

  // Handle notification settings toggle (Database)
  const handleSettingToggle = (
    key: 'emailNotifications' | 'projectUpdates' | 'productUpdates',
    checked: boolean
  ) => {
    updateSettings({ [key]: checked });
  };

  if (isUserLoading || isSettingsLoading) {
    return <NotificationsSkeleton />;
  }

  const isEmailsDisabled = settings?.emailNotifications === false;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Notifications</CardTitle>
          <CardDescription>Control which notifications you receive via email.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Master email toggle */}
            <div className="flex items-start justify-between space-x-3">
              <div className="space-y-1">
                <Label htmlFor="email-notifications" className="text-sm font-medium cursor-pointer">
                  Email Notifications
                </Label>
                <p className="text-xs text-muted-foreground">
                  Receive important notifications via email
                </p>
              </div>
              <Switch
                id="email-notifications"
                checked={settings?.emailNotifications ?? true}
                onCheckedChange={checked => handleSettingToggle('emailNotifications', checked)}
                disabled={isUpdating}
                className="mt-0.5 shrink-0"
              />
            </div>

            <div className="pt-4 space-y-4">
              {/* Project updates */}
              <div className="flex items-start justify-between space-x-3">
                <div className="space-y-1">
                  <Label
                    htmlFor="project-updates"
                    className={`text-sm font-medium cursor-pointer ${isEmailsDisabled ? 'text-muted-foreground' : ''}`}
                  >
                    Project Updates
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Notifications about build status, deployments, and project changes
                  </p>
                </div>
                <Switch
                  id="project-updates"
                  checked={settings?.projectUpdates ?? true}
                  onCheckedChange={checked => handleSettingToggle('projectUpdates', checked)}
                  disabled={isUpdating || isEmailsDisabled}
                  className="mt-0.5 shrink-0"
                />
              </div>

              {/* Product updates */}
              <div className="flex items-start justify-between space-x-3">
                <div className="space-y-1">
                  <Label
                    htmlFor="product-updates"
                    className={`text-sm font-medium cursor-pointer ${isEmailsDisabled ? 'text-muted-foreground' : ''}`}
                  >
                    Product Updates
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Announcements about new features and platform improvements
                  </p>
                </div>
                <Switch
                  id="product-updates"
                  checked={settings?.productUpdates ?? true}
                  onCheckedChange={checked => handleSettingToggle('productUpdates', checked)}
                  disabled={isUpdating || isEmailsDisabled}
                  className="mt-0.5 shrink-0"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marketing Communications</CardTitle>
          <CardDescription>Promotional content and newsletters.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between space-x-3">
            <div className="space-y-1">
              <Label htmlFor="marketing-emails" className="text-sm font-medium cursor-pointer">
                Marketing Emails
              </Label>
              <p className="text-xs text-muted-foreground">
                Receive emails about new features, tips, and special offers
              </p>
            </div>
            <Switch
              id="marketing-emails"
              checked={user?.marketingEmails || false}
              onCheckedChange={handleMarketingToggle}
              disabled={isSubmittingMarketing}
              className="mt-0.5 shrink-0"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
