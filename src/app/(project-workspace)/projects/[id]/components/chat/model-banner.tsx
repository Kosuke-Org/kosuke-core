'use client';

import { useAgentHealth } from '@/hooks/use-agent-health';
import { cn } from '@/lib/utils';

interface ModelBannerProps {
  className?: string;
  model?: string;
  projectId?: string;
  showAgentStatus?: boolean;
}

export default function ModelBanner({
  className,
  model,
  projectId,
  showAgentStatus = false,
}: ModelBannerProps) {
  // Format model name for display
  const getModelDisplayName = (modelId?: string) => {
    if (!modelId) return 'Unknown';
    if (modelId.includes('claude-sonnet-4-5')) return 'Claude Sonnet 4.5';
    if (modelId.includes('claude-haiku-4-5')) return 'Claude Haiku 4.5';
    if (modelId.includes('claude-opus-4-5')) return 'Claude Opus 4.5';
    return modelId;
  };

  const modelName = getModelDisplayName(model);

  // Agent health check - only when showing agent status and projectId is provided
  const shouldCheckHealth = showAgentStatus && projectId !== undefined && projectId !== '';

  const { data: agentHealth } = useAgentHealth({
    projectId: projectId || '',
    enabled: shouldCheckHealth,
    pollingInterval: 10000,
  });

  // Determine agent status display
  const getAgentStatusDisplay = () => {
    if (!showAgentStatus || !projectId) return null;

    if (!agentHealth) {
      return {
        color: 'bg-muted-foreground',
        text: 'Checking...',
        pulse: true,
      };
    }

    if (!agentHealth.running) {
      return {
        color: 'bg-muted-foreground',
        text: 'Sandbox stopped',
        pulse: false,
      };
    }

    if (!agentHealth.alive) {
      return {
        color: 'bg-yellow-500',
        text: 'Agent starting...',
        pulse: true,
      };
    }

    if (agentHealth.processing) {
      return {
        color: 'bg-blue-500',
        text: 'Processing',
        pulse: true,
      };
    }

    if (agentHealth.ready) {
      return {
        color: 'bg-green-500',
        text: 'Ready',
        pulse: false,
      };
    }

    return {
      color: 'bg-yellow-500',
      text: 'Busy',
      pulse: true,
    };
  };

  const agentStatus = getAgentStatusDisplay();

  return (
    <div className={cn('px-4', className)}>
      <div className="flex items-center justify-between w-full px-4 py-2.5 rounded-md bg-gradient-to-r from-primary/5 to-background">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Powered by:</span>
          <span className="text-xs font-medium">{modelName}</span>
        </div>

        {agentStatus && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Agent:</span>
            <div className="flex items-center gap-1">
              <div className="relative">
                <div className={cn('h-2 w-2 rounded-full', agentStatus.color)} />
                {agentStatus.pulse && (
                  <div
                    className={cn(
                      'absolute inset-0 h-2 w-2 rounded-full animate-ping',
                      agentStatus.color,
                      'opacity-75'
                    )}
                  />
                )}
              </div>
              <span className="text-xs font-medium">{agentStatus.text}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
