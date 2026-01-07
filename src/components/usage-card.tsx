'use client';

import { AlertCircle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOrgUsage } from '@/hooks/use-org-usage';
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

interface UsageCardProps {
  orgId: string | undefined;
}

/**
 * Reusable usage card component that displays token usage and costs
 * Used in both admin and logged-in organization pages
 */
export function UsageCard({ orgId }: UsageCardProps) {
  const { data, isLoading, error } = useOrgUsage(orgId);

  const usage = data?.usage;
  const langfuseUrl = data?.langfuseUrl;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <CardTitle>Token Usage</CardTitle>
            <CardDescription>
              View token usage and costs across all projects and sessions.
            </CardDescription>
          </div>
          {langfuseUrl && (
            <Button asChild variant="outline" size="sm">
              <Link href={langfuseUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                View in Langfuse
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <UsageTableSkeleton />
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load usage data: {error instanceof Error ? error.message : 'Unknown error'}
            </AlertDescription>
          </Alert>
        ) : !usage || usage.projects.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No usage data available yet.</p>
            <p className="text-sm mt-1">
              Usage will appear here once the organization starts using the platform.
            </p>
          </div>
        ) : (
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
              <p className="text-sm font-medium text-muted-foreground mb-3">Breakdown by Project</p>
              <div className="border rounded-md divide-y">
                {usage.projects.map(project => (
                  <ProjectRow key={project.projectId} project={project} />
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
