'use client';

import { Bell, Palette, Shield, User } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentTab = pathname === '/settings' ? 'account' : pathname.split('/').pop() || 'account';

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col space-y-2">
          <h1 className="text-2xl tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account settings and preferences.
          </p>
        </div>

        <Tabs value={currentTab} className="w-full">
          <TabsList className="w-full max-w-3xl">
            <TabsTrigger value="account" className="flex items-center gap-2" asChild>
              <Link href="/settings">
                <User className="h-4 w-4" />
                <span>Account</span>
              </Link>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2" asChild>
              <Link href="/settings/notifications">
                <Bell className="h-4 w-4" />
                <span>Notifications</span>
              </Link>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2" asChild>
              <Link href="/settings/security">
                <Shield className="h-4 w-4" />
                <span>Security</span>
              </Link>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center gap-2" asChild>
              <Link href="/settings/appearance">
                <Palette className="h-4 w-4" />
                <span>Appearance</span>
              </Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Suspense fallback={<SettingsLayoutSkeleton />}>
          <div className="max-w-3xl">{children}</div>
        </Suspense>
      </div>
    </div>
  );
}

function SettingsLayoutSkeleton() {
  return (
    <div className="max-w-3xl">
      <div className="h-[400px] w-full space-y-6">
        <div className="rounded-lg border p-6 space-y-4">
          <div className="space-y-2">
            <div className="h-6 bg-muted rounded w-48 animate-pulse" />
            <div className="h-4 bg-muted rounded w-80 animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded w-24 animate-pulse" />
              <div className="h-10 bg-muted rounded w-full animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded w-32 animate-pulse" />
              <div className="h-10 bg-muted rounded w-full animate-pulse" />
            </div>
            <div className="flex justify-end">
              <div className="h-10 bg-muted rounded w-24 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
