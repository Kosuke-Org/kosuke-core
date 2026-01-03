'use client';

import { useOrganization } from '@clerk/nextjs';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useOrgUsage } from '@/hooks/use-org-usage';
import { useOrganizationApiKeys } from '@/hooks/use-organization-api-keys';
import type { ProjectUsage, SessionUsage, UsageMetrics } from '@/lib/types';

/**
 * Format a number with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Format a cost value as USD
 */
function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Metrics table row component
 */
function MetricsRow({
  label,
  tokens,
  cost,
  isTotal = false,
}: {
  label: string;
  tokens: number;
  cost: number;
  isTotal?: boolean;
}) {
  return (
    <TableRow className={isTotal ? 'font-semibold bg-muted/50' : ''}>
      <TableCell className={isTotal ? 'font-semibold' : ''}>{label}</TableCell>
      <TableCell className="text-right tabular-nums">{formatNumber(tokens)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCost(cost)}</TableCell>
    </TableRow>
  );
}

/**
 * Render metrics table
 */
function MetricsTable({ metrics }: { metrics: UsageMetrics }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[150px]">Metric</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="text-right">Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <MetricsRow label="Input" tokens={metrics.input.tokens} cost={metrics.input.cost} />
        <MetricsRow label="Output" tokens={metrics.output.tokens} cost={metrics.output.cost} />
        <MetricsRow
          label="Cache Read"
          tokens={metrics.cacheRead.tokens}
          cost={metrics.cacheRead.cost}
        />
        <MetricsRow
          label="Cache Creation"
          tokens={metrics.cacheCreation.tokens}
          cost={metrics.cacheCreation.cost}
        />
        <MetricsRow label="Total" tokens={metrics.total.tokens} cost={metrics.total.cost} isTotal />
      </TableBody>
    </Table>
  );
}

/**
 * Session usage row (innermost level)
 */
function SessionRow({ session }: { session: SessionUsage }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-2 py-2 px-4 hover:bg-muted/50 cursor-pointer rounded-md">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium truncate flex-1">
            {session.sessionName || `Session ${session.sessionId.slice(0, 8)}...`}
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatNumber(session.metrics.total.tokens)} tokens
          </span>
          <span className="text-sm font-medium tabular-nums">
            {formatCost(session.metrics.total.cost)}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-6 mt-2 mb-4 border rounded-md overflow-hidden">
          <MetricsTable metrics={session.metrics} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Project usage row (middle level)
 */
function ProjectRow({ project }: { project: ProjectUsage }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-2 py-3 px-4 hover:bg-muted/50 cursor-pointer rounded-md border-b">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium truncate flex-1">{project.projectName}</span>
          <Badge variant="secondary" className="text-xs">
            {project.sessions.length} session{project.sessions.length !== 1 ? 's' : ''}
          </Badge>
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatNumber(project.metrics.total.tokens)} tokens
          </span>
          <span className="font-medium tabular-nums">{formatCost(project.metrics.total.cost)}</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 mt-2 space-y-1">
          {/* Project metrics summary */}
          <div className="mb-3 border rounded-md overflow-hidden">
            <MetricsTable metrics={project.metrics} />
          </div>

          {/* Sessions */}
          {project.sessions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">
                Sessions
              </p>
              {project.sessions.map(session => (
                <SessionRow key={session.sessionId} session={session} />
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Usage table component
 */
function UsageTable() {
  const { organization } = useOrganization();
  const { data: usage, isLoading, error } = useOrgUsage(organization?.id);

  if (isLoading) {
    return <UsageTableSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load usage data: {error instanceof Error ? error.message : 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!usage || usage.projects.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No usage data available yet.</p>
        <p className="text-sm mt-1">Usage will appear here once you start using the platform.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Organization total */}
      <div className="border rounded-md overflow-hidden">
        <div className="bg-muted/50 px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Organization Total</span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatNumber(usage.metrics.total.tokens)} tokens
              </span>
              <span className="font-semibold tabular-nums">
                {formatCost(usage.metrics.total.cost)}
              </span>
            </div>
          </div>
        </div>
        <MetricsTable metrics={usage.metrics} />
      </div>

      {/* Projects breakdown */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-3">
          Breakdown by Project ({usage.projects.length})
        </p>
        <div className="border rounded-md divide-y">
          {usage.projects.map(project => (
            <ProjectRow key={project.projectId} project={project} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for usage table
 */
function UsageTableSkeleton() {
  return (
    <div className="space-y-4">
      {/* Organization total skeleton */}
      <div className="border rounded-md overflow-hidden">
        <div className="bg-muted/50 px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <div className="flex gap-8">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Projects skeleton */}
      <div>
        <Skeleton className="h-4 w-48 mb-3" />
        <div className="border rounded-md divide-y">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 py-3 px-4">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 flex-1 max-w-[200px]" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OrganizationUsagePage() {
  const { organization, isLoaded, membership } = useOrganization();
  const {
    status: apiKeyStatus,
    isLoading: isLoadingStatus,
    saveApiKey,
    isSaving,
    deleteApiKey,
    isDeleting,
  } = useOrganizationApiKeys(organization?.id);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  const isAdmin = membership?.role === 'org:admin';

  const handleSaveApiKey = () => {
    if (!apiKeyInput.trim()) return;
    saveApiKey(apiKeyInput, {
      onSuccess: () => setApiKeyInput(''),
    });
  };

  const handleDeleteApiKey = () => {
    deleteApiKey();
  };

  if (!isLoaded) {
    return <UsagePageSkeleton />;
  }

  if (!organization) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Organization not found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* API Key Management Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle>Anthropic API Key</CardTitle>
              <CardDescription>
                Use your own Anthropic API key for code generation in sandboxes.
              </CardDescription>
            </div>
            {!isLoadingStatus && (
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  {apiKeyStatus?.hasCustomKey && isAdmin && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDeleteApiKey}
                          disabled={isDeleting}
                          className="text-destructive hover:text-destructive"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>This will switch back to using the system default API key.</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant={apiKeyStatus?.hasCustomKey ? 'default' : 'secondary'}>
                        {apiKeyStatus?.hasCustomKey ? 'Custom Key' : 'System Default'}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {apiKeyStatus?.hasCustomKey
                          ? `Using: ${apiKeyStatus.maskedKey}`
                          : 'All code generation will use the platform API key.'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Status */}
          {isLoadingStatus ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {/* Admin-only API Key Management */}
              {isAdmin ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="apiKey">
                        {apiKeyStatus?.hasCustomKey ? 'Update API Key' : 'Set API Key'}
                      </Label>
                      {apiKeyStatus?.hasCustomKey && apiKeyStatus.maskedKey && (
                        <span className="text-xs text-muted-foreground">
                          Current: {apiKeyStatus.maskedKey}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          id="apiKey"
                          type={showApiKey ? 'text' : 'password'}
                          placeholder="sk-ant-api03-..."
                          value={apiKeyInput}
                          onChange={e => setApiKeyInput(e.target.value)}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                      <Button onClick={handleSaveApiKey} disabled={isSaving || !apiKeyInput.trim()}>
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Validating...
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Save
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your API key will be encrypted and validated before saving.
                    </p>
                  </div>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Only organization admins can manage API keys.</AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Usage Table Card */}
      <Card>
        <CardHeader>
          <CardTitle>Token Usage</CardTitle>
          <CardDescription>
            View token usage and costs across all projects and sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsageTable />
        </CardContent>
      </Card>
    </div>
  );
}

function UsagePageSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-96" />
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <UsageTableSkeleton />
        </CardContent>
      </Card>
    </div>
  );
}
