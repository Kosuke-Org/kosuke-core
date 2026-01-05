'use client';

import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

interface StreamingLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  job: Job | null;
  logs: unknown[];
}

export function StreamingLogsDialog({
  open,
  onOpenChange,
  title,
  job,
  logs,
}: StreamingLogsDialogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs come in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const renderLogEvent = (event: LogEvent, index: number) => {
    const { type: eventType, data } = event;

    switch (eventType) {
      case 'vamos_started':
      case 'deploy_started':
        return (
          <div key={index} className="py-1.5 text-sm text-muted-foreground">
            Started
            {data.mode ? <span className="ml-2">({String(data.mode)})</span> : null}
          </div>
        );

      case 'step_started':
        return (
          <div key={index} className="py-1.5 text-sm">
            <span className="text-muted-foreground">
              Step {String(data.step)}/{String(data.total)}:
            </span>
            <span className="ml-2 text-foreground">{String(data.name)}</span>
          </div>
        );

      case 'step_completed':
        return (
          <div key={index} className="py-1 text-sm text-muted-foreground flex items-center">
            <CheckCircle2 className="h-3 w-3 mr-2 shrink-0" />
            <span>Completed: {String(data.name || data.step)}</span>
          </div>
        );

      case 'step_skipped':
        return (
          <div key={index} className="py-1 text-sm text-muted-foreground">
            Skipped: {String(data.name)} ({String(data.reason)})
          </div>
        );

      case 'ticket_started':
        return (
          <div key={index} className="py-1.5 text-sm">
            <span className="text-foreground">
              Ticket {String(data.index)}/{String(data.total)}:
            </span>
            <span className="ml-2 text-muted-foreground">{String(data.title)}</span>
          </div>
        );

      case 'ticket_phase':
        return (
          <div key={index} className="py-0.5 pl-4 text-sm text-muted-foreground">
            {String(data.phase)}: {String(data.status)}
          </div>
        );

      case 'ticket_completed':
        return (
          <div key={index} className="py-1 pl-4 text-sm flex items-center text-muted-foreground">
            {data.result === 'success' ? (
              <CheckCircle2 className="h-3 w-3 mr-2 shrink-0" />
            ) : (
              <XCircle className="h-3 w-3 mr-2 shrink-0" />
            )}
            <span>Ticket {String(data.result)}</span>
          </div>
        );

      case 'test_started':
        return (
          <div key={index} className="py-1 text-sm text-muted-foreground">
            Test {String(data.index)}/{String(data.total)}: {String(data.title)}
          </div>
        );

      case 'test_completed':
        return (
          <div key={index} className="py-1 text-sm flex items-center text-muted-foreground">
            {data.result === 'success' ? (
              <CheckCircle2 className="h-3 w-3 mr-2 shrink-0" />
            ) : (
              <XCircle className="h-3 w-3 mr-2 shrink-0" />
            )}
            <span>
              Test {String(data.result)} ({String(data.attempts)} attempts)
            </span>
          </div>
        );

      case 'storage_deploying':
      case 'service_deploying':
        return (
          <div key={index} className="py-1 text-sm flex items-center text-muted-foreground">
            <Loader2 className="h-3 w-3 mr-2 animate-spin shrink-0" />
            <span>
              Deploying {String(data.name)} ({String(data.type)})
            </span>
          </div>
        );

      case 'storage_deployed':
      case 'service_deployed':
        return (
          <div key={index} className="py-1 text-sm flex items-center text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 mr-2 shrink-0" />
            <span>Deployed: {String(data.key)}</span>
            {data.url ? <span className="ml-2">{String(data.url)}</span> : null}
          </div>
        );

      case 'storage_exists':
      case 'service_exists':
        return (
          <div key={index} className="py-0.5 text-sm text-muted-foreground">
            Already exists: {String(data.key)}
          </div>
        );

      case 'message':
        return (
          <div key={index} className="py-0.5 text-sm text-muted-foreground">
            {String(data.text)}
          </div>
        );

      case 'agent_log': {
        const logType = data.logType as string;
        const action = data.action as string | undefined;
        const params = data.params as Record<string, unknown> | undefined;
        const text = data.text as string | undefined;

        if (logType === 'tool_call' && action) {
          let message = action;

          switch (action) {
            case 'Read':
              message = `Reading ${params?.path || 'file'}`;
              break;
            case 'Grep':
              message = `Searching: ${params?.pattern || 'pattern'}`;
              break;
            case 'Glob':
              message = `Finding: ${params?.pattern || 'pattern'}`;
              break;
            case 'Write':
              message = `Writing ${params?.path || 'file'}`;
              break;
            case 'Edit':
              message = `Editing ${params?.path || 'file'}`;
              break;
            case 'Bash':
              message = `Running: ${params?.command || 'command'}`;
              break;
            case 'Task':
              message = `${params?.type || 'Task'}: ${params?.description || ''}`;
              break;
            case 'WebSearch':
              message = `Searching: ${params?.query || 'query'}`;
              break;
            case 'WebFetch':
              message = `Fetching: ${params?.url || 'url'}`;
              break;
            default:
              message = action;
          }

          return (
            <div key={index} className="py-0.5 text-sm text-muted-foreground pl-4">
              {message}
            </div>
          );
        }

        if (logType === 'message' && text) {
          const truncated = text.length > 150 ? text.substring(0, 150) + '...' : text;
          return (
            <div key={index} className="py-0.5 text-sm text-muted-foreground pl-4">
              {truncated}
            </div>
          );
        }

        return null;
      }

      case 'error':
        return (
          <div key={index} className="py-1 text-sm text-destructive flex items-center">
            <XCircle className="h-3 w-3 mr-2 shrink-0" />
            <span>Error: {String(data.message)}</span>
          </div>
        );

      case 'done':
        return (
          <div key={index} className="py-1.5 text-sm">
            {data.success ? (
              <span className="text-muted-foreground flex items-center">
                <CheckCircle2 className="h-3 w-3 mr-2 shrink-0" />
                Completed successfully
              </span>
            ) : (
              <span className="text-destructive flex items-center">
                <XCircle className="h-3 w-3 mr-2 shrink-0" />
                Failed: {String(data.error || 'Unknown error')}
              </span>
            )}
          </div>
        );

      default:
        return (
          <div key={index} className="py-0.5 text-xs text-muted-foreground">
            [{eventType}] {JSON.stringify(data).slice(0, 100)}
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[80vw] max-w-[80vw] sm:max-w-[80vw] md:max-w-[80vw] lg:max-w-[80vw] xl:max-w-[80vw] h-[85vh] flex flex-col p-0 gap-0"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              {job?.status === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
              {job?.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              {job?.status === 'failed' && <XCircle className="h-4 w-4 text-destructive" />}
              {title}
              {job?.startedAt && (
                <span className="text-muted-foreground font-normal text-sm">
                  {formatDistanceToNow(new Date(job.startedAt))}
                </span>
              )}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Logs - Full Height */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 font-mono text-sm">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              {job?.error ? (
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>{job.error}</span>
                </div>
              ) : job?.status === 'pending' ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Waiting for job to start...</span>
                </div>
              ) : (
                <span className="text-muted-foreground">No logs yet</span>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {logs.map((log, index) => renderLogEvent(log as LogEvent, index))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
