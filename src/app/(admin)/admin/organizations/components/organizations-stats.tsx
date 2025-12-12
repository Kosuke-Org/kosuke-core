'use client';

import { Building2, Database } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OrganizationStats } from '@/lib/types';

interface OrganizationsStatsProps {
  stats: OrganizationStats;
}

export function OrganizationsStats({ stats }: OrganizationsStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Organizations</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalOrganizations.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground mt-1">All registered organizations</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
          <Database className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalActiveProjects?.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground mt-1">Non-archived projects</p>
        </CardContent>
      </Card>
    </div>
  );
}
