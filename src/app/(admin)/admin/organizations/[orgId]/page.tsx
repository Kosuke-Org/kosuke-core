'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, Users, Database, MessageSquare, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { use } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { ClerkOrganization } from '@/lib/types';

interface OrganizationDetailResponse {
  organization: ClerkOrganization;
  members: unknown[];
  projects: unknown[];
}

export default function OrganizationDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);

  const { data, isLoading } = useQuery<OrganizationDetailResponse>({
    queryKey: ['admin-organization-detail', orgId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/organizations/${orgId}`);
      if (!response.ok) throw new Error('Failed to fetch organization details');
      const result = await response.json();
      return result.data;
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-muted-foreground">Organization not found</p>
      </div>
    );
  }

  const { organization, members, projects } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/organizations">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Organizations
          </Link>
        </Button>
      </div>

      {/* Organization Info */}
      <div className="flex items-center gap-4">
        {organization.imageUrl ? (
          <Image
            src={organization.imageUrl}
            alt={organization.name}
            width={64}
            height={64}
            className="rounded-lg"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{organization.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            {organization.slug && <p className="text-muted-foreground">@{organization.slug}</p>}
            <Badge variant={organization.isPersonal ? 'secondary' : 'default'}>
              {organization.isPersonal ? 'Personal' : 'Team'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chat Sessions</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-96" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
