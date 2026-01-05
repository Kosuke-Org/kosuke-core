'use client';

import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface LogEvent {
  type: string;
  data: Record<string, unknown>;
}

interface Job {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  phase?: string | null;
  currentStep?: string | null;
  totalPhases?: number | null;
  completedPhases?: number | null;
  error?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

interface StreamingLogsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  job: Job | null;
  logs: unknown[];
  type: 'vamos' | 'deploy';
}

export function StreamingLogsSheet({
  open,
  onOpenChange,
  title,
  description,
  job,
  logs,
  type,
}: StreamingLogsSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs come in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getStatusBadge = (status: Job['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'running':
        return (
          <Badge variant="default" className="bg-blue-500">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Running
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const renderLogEvent = (event: LogEvent, index: number) => {
    const { type: eventType, data } = event;

    // Format event display based on type
    switch (eventType) {
      case 'vamos_started':
      case 'deploy_started':
        return (
          <div key={index} className="py-2 border-b border-border">
            <span className="text-green-500 font-medium">Started</span>
            {data.mode ? (
              <span className="text-muted-foreground ml-2">Mode: {String(data.mode)}</span>
            ) : null}
            {data.projectName ? (
              <span className="text-muted-foreground ml-2">{String(data.projectName)}</span>
            ) : null}
          </div>
        );

      case 'step_started':
        return (
          <div key={index} className="py-2 border-b border-border">
            <span className="text-blue-500 font-medium">
              Step {String(data.step)}/{String(data.total)}
            </span>
            <span className="ml-2">{String(data.name)}</span>
          </div>
        );

      case 'step_completed':
        return (
          <div key={index} className="py-1 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 inline mr-1 text-green-500" />
            Step completed: {String(data.name || data.step)}
          </div>
        );

      case 'step_skipped':
        return (
          <div key={index} className="py-1 text-muted-foreground">
            <span className="text-yellow-500">Skipped:</span> {String(data.name)} (
            {String(data.reason)})
          </div>
        );

      case 'ticket_started':
        return (
          <div key={index} className="py-2 border-b border-border bg-muted/30 px-2 rounded">
            <span className="font-medium">
              Ticket {String(data.index)}/{String(data.total)}
            </span>
            <span className="ml-2">{String(data.title)}</span>
          </div>
        );

      case 'ticket_phase':
        return (
          <div key={index} className="py-1 pl-4 text-sm text-muted-foreground">
            {String(data.phase)}: {String(data.status)}
          </div>
        );

      case 'ticket_completed':
        return (
          <div key={index} className="py-1 pl-4">
            {data.result === 'success' ? (
              <CheckCircle2 className="h-4 w-4 inline mr-1 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 inline mr-1 text-red-500" />
            )}
            Ticket {String(data.result)}
          </div>
        );

      case 'test_started':
        return (
          <div key={index} className="py-1 text-sm">
            <span className="text-cyan-500">
              Test {String(data.index)}/{String(data.total)}:
            </span>{' '}
            {String(data.title)}
          </div>
        );

      case 'test_completed':
        return (
          <div key={index} className="py-1 text-sm">
            {data.result === 'success' ? (
              <CheckCircle2 className="h-4 w-4 inline mr-1 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 inline mr-1 text-red-500" />
            )}
            Test {String(data.result)} ({String(data.attempts)} attempts)
          </div>
        );

      case 'storage_deploying':
      case 'service_deploying':
        return (
          <div key={index} className="py-1 text-sm">
            <Loader2 className="h-3 w-3 inline mr-1 animate-spin" />
            Deploying {String(data.name)} ({String(data.type)})
          </div>
        );

      case 'storage_deployed':
      case 'service_deployed':
        return (
          <div key={index} className="py-1 text-sm">
            <CheckCircle2 className="h-4 w-4 inline mr-1 text-green-500" />
            Deployed: {String(data.key)}
            {data.url ? <span className="text-blue-500 ml-2">{String(data.url)}</span> : null}
          </div>
        );

      case 'storage_exists':
      case 'service_exists':
        return (
          <div key={index} className="py-1 text-sm text-muted-foreground">
            Already exists: {String(data.key)}
          </div>
        );

      case 'message':
        return (
          <div key={index} className="py-1 text-sm text-muted-foreground">
            {String(data.text)}
          </div>
        );

      case 'agent_log': {
        const logType = data.logType as string;
        const action = data.action as string | undefined;
        const params = data.params as Record<string, unknown> | undefined;
        const text = data.text as string | undefined;

        if (logType === 'tool_call' && action) {
          let icon = '🔧';
          let message = action;

          switch (action) {
            case 'Read':
              icon = '📄';
              message = `Reading ${params?.path || 'file'}`;
              break;
            case 'Grep':
              icon = '🔍';
              message = `Searching: ${params?.pattern || 'pattern'}`;
              break;
            case 'Glob':
              icon = '📁';
              message = `Finding: ${params?.pattern || 'pattern'}`;
              break;
            case 'Write':
              icon = '✍️';
              message = `Writing ${params?.path || 'file'}`;
              break;
            case 'Edit':
              icon = '✏️';
              message = `Editing ${params?.path || 'file'}`;
              break;
            case 'Bash':
              icon = '💻';
              message = `Running: ${params?.command || 'command'}`;
              break;
            case 'Task':
              icon = '🤖';
              message = `${params?.type || 'Task'}: ${params?.description || ''}`;
              break;
            case 'WebSearch':
              icon = '🌐';
              message = `Searching: ${params?.query || 'query'}`;
              break;
            case 'WebFetch':
              icon = '🌐';
              message = `Fetching: ${params?.url || 'url'}`;
              break;
            default:
              message = action;
          }

          return (
            <div key={index} className="py-0.5 text-sm text-muted-foreground pl-4">
              <span className="mr-1">{icon}</span>
              {message}
            </div>
          );
        }

        if (logType === 'message' && text) {
          const truncated = text.length > 150 ? text.substring(0, 150) + '...' : text;
          return (
            <div key={index} className="py-0.5 text-sm text-muted-foreground pl-4">
              <span className="mr-1">💭</span>
              {truncated}
            </div>
          );
        }

        return null;
      }

      case 'error':
        return (
          <div key={index} className="py-2 text-red-500">
            <XCircle className="h-4 w-4 inline mr-1" />
            Error: {String(data.message)}
          </div>
        );

      case 'done':
        return (
          <div key={index} className="py-2 border-t border-border mt-2">
            {data.success ? (
              <span className="text-green-500 font-medium">Completed successfully</span>
            ) : (
              <span className="text-red-500 font-medium">
                Failed: {String(data.error || 'Unknown error')}
              </span>
            )}
          </div>
        );

      default:
        return (
          <div key={index} className="py-1 text-xs text-muted-foreground">
            [{eventType}] {JSON.stringify(data).slice(0, 100)}
          </div>
        );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {title}
            {job && getStatusBadge(job.status)}
          </SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Job Info */}
          {job && (
            <div className="text-sm text-muted-foreground space-y-2">
              <div>
                <span className="font-medium text-foreground">Job ID:</span> {job.id}
              </div>
              {job.startedAt && (
                <div>
                  <span className="font-medium text-foreground">Started:</span>{' '}
                  {formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })}
                </div>
              )}
              {type === 'vamos' && job.phase && (
                <div>
                  <span className="font-medium text-foreground">Phase:</span> {job.phase} (
                  {job.completedPhases}/{job.totalPhases})
                </div>
              )}
              {type === 'deploy' && job.currentStep && (
                <div>
                  <span className="font-medium text-foreground">Current step:</span>{' '}
                  {job.currentStep}
                </div>
              )}
              {job.error && <div className="text-red-500">Error: {job.error}</div>}
            </div>
          )}

          {/* Logs */}
          <div className="border rounded-lg">
            <ScrollArea className="h-[500px]" ref={scrollRef}>
              <div className="p-4 font-mono text-sm">
                {logs.length === 0 ? (
                  <div className="text-muted-foreground text-center py-8">
                    {job?.status === 'pending' ? 'Waiting for job to start...' : 'No logs yet'}
                  </div>
                ) : (
                  logs.map((log, index) => renderLogEvent(log as LogEvent, index))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
