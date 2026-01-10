'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Database, Loader2, MessageSquare, Users, Zap } from 'lucide-react';
import Image from 'next/image';
import { use } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { UsageCard } from '@/components/usage-card';
import { useToast } from '@/hooks/use-toast';
import type { ClerkOrganization } from '@/lib/types';

interface OrganizationDetailResponse {
  organization: ClerkOrganization;
  members: unknown[];
  projects: unknown[];
}

export default function OrganizationDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<OrganizationDetailResponse>({
    queryKey: ['admin-organization-detail', orgId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/organizations/${orgId}`);
      if (!response.ok) throw new Error('Failed to fetch organization details');
      const result = await response.json();
      return result.data;
    },
  });

  const toggleBetaMutation = useMutation({
    mutationFn: async (isBeta: boolean) => {
      const response = await fetch(`/api/admin/organizations/${orgId}/beta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isBeta }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update beta status');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-organization-detail', orgId] });
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
      toast({
        title: 'Beta status updated',
        description: 'Organization beta status has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
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
      {/* Organization Info */}
      <div className="flex items-center justify-between">
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
              {organization.isBeta && (
                <Badge variant="outline" className="border-amber-500 text-amber-500">
                  Beta
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Beta Toggle */}
        <div className="flex items-center gap-2">
          {toggleBetaMutation.isPending && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Label htmlFor="beta-toggle" className="text-sm text-muted-foreground">
            Beta Access
          </Label>
          <Switch
            id="beta-toggle"
            checked={organization.isBeta}
            onCheckedChange={checked => toggleBetaMutation.mutate(checked)}
            disabled={toggleBetaMutation.isPending}
          />
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

      {/* Usage Card */}
      <UsageCard orgId={orgId} />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
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
