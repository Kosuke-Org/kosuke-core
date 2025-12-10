'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectPreviewUrls } from '@/hooks/use-preview-urls';
import type { PreviewUrl } from '@/lib/types/preview-urls';
import { Activity, ExternalLink, Globe } from 'lucide-react';

interface SubdomainDisplayProps {
  projectId: string;
}

export function SubdomainDisplay({ projectId }: SubdomainDisplayProps) {
  const { data: previewData, isLoading, error } = useProjectPreviewUrls(projectId);

  if (isLoading) {
    return <SubdomainDisplaySkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load preview URLs. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  const previewUrls = previewData?.preview_urls || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-medium">Preview URLs</h3>
          <p className="text-muted-foreground mt-2">
            Automatically generated subdomains for your project branches
          </p>
        </div>
      </div>

      {previewUrls.length === 0 ? (
        <Card className="py-0">
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No active preview deployments</p>
              <p className="text-sm">Start a chat session to generate preview URLs</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {previewUrls.map((preview: PreviewUrl) => (
            <PreviewUrlCard key={preview.id} preview={preview} />
          ))}
        </div>
      )}
    </div>
  );
}

const SubdomainDisplaySkeleton = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <Skeleton className="h-5 w-32" />

            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-56" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-6 w-12" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewUrlCard({ preview }: { preview: PreviewUrl }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'default';
      case 'stopped':
        return 'secondary';
      case 'error':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Activity className="w-3 h-3" />;
      default:
        return null;
    }
  };

  return (
    <Card className="py-0">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <a
                href={preview.full_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1 font-medium"
              >
                {preview.full_url.replace('https://', '')}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="text-sm text-muted-foreground">
              Branch: <code className="bg-muted px-1 rounded text-xs font-mono">{preview.branch_name}</code>
            </div>
            <div className="text-sm text-muted-foreground">
              Created: {new Date(preview.created_at).toLocaleDateString()}
            </div>
          </div>
          <div className="flex gap-2 ml-3">
            <Badge variant={getStatusColor(preview.container_status)}>
              {getStatusIcon(preview.container_status)}
              {preview.container_status}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
