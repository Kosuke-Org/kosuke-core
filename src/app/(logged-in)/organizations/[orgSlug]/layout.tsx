'use client';

import { Building2, Key, Users } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { Suspense } from 'react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

function getCurrentTab(pathname: string): string {
  if (pathname.endsWith('/members')) return 'members';
  if (pathname.endsWith('/usage')) return 'usage';
  return 'general';
}

export default function OrganizationSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const orgSlug = params.orgSlug as string;

  const currentTab = getCurrentTab(pathname);

  const handleTabChange = (value: string) => {
    router.push(`/organizations/${orgSlug}/${value === 'general' ? '' : value}`);
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col space-y-2">
          <h1 className="text-2xl tracking-tight">Organization Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your organization settings.</p>
        </div>

        <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
          <TabsList>
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>General</span>
            </TabsTrigger>
            <TabsTrigger value="members" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>Members</span>
            </TabsTrigger>
            <TabsTrigger value="usage" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              <span>Usage</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Suspense fallback={<div>Loading...</div>}>
          <div>{children}</div>
        </Suspense>
      </div>
    </div>
  );
}
