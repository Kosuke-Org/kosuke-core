'use client';

import { useEffect, useRef, useState } from 'react';

import { useAgentHealth, type AgentHealthStatus } from '@/hooks/use-agent-health';
import { cn } from '@/lib/utils';

interface ModelBannerProps {
  className?: string;
  model?: string;
  projectId?: string;
  showAgentStatus?: boolean;
  agentHealth?: AgentHealthStatus;
}

// Number of consecutive failed checks before showing "Sandbox stopped"
const FAILURE_THRESHOLD = 3;

export default function ModelBanner({
  className,
  model,
  projectId,
  showAgentStatus = false,
  agentHealth: passedAgentHealth,
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
  // Skip fetching if agentHealth is passed from parent
  const shouldCheckHealth =
    showAgentStatus && projectId !== undefined && projectId !== '' && !passedAgentHealth;

  const { data: fetchedAgentHealth, dataUpdatedAt } = useAgentHealth({
    projectId: projectId || '',
    enabled: shouldCheckHealth,
    pollingInterval: 10000,
  });

  // Use passed data if provided, otherwise use fetched data
  const agentHealth = passedAgentHealth || fetchedAgentHealth;

  // Track consecutive "not running" checks
  const [failureCount, setFailureCount] = useState(0);
  const lastDataUpdatedAtRef = useRef(0);

  // Update failure count when agentHealth changes
  useEffect(() => {
    // When using passed data, track based on the data itself
    // When fetching, track based on dataUpdatedAt to detect new fetches
    if (!passedAgentHealth) {
      if (dataUpdatedAt === lastDataUpdatedAtRef.current) return;
      lastDataUpdatedAtRef.current = dataUpdatedAt;
    }

    if (!agentHealth) return;

    if (!agentHealth.running) {
      setFailureCount(prev => prev + 1);
    } else {
      // Reset on successful check
      setFailureCount(0);
    }
  }, [agentHealth, dataUpdatedAt, passedAgentHealth]);

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
      // Only show "Sandbox stopped" after reaching failure threshold
      if (failureCount >= FAILURE_THRESHOLD) {
        return {
          color: 'bg-muted-foreground',
          text: 'Sandbox stopped',
          pulse: false,
        };
      }
      // Still checking - show checking state until threshold reached
      return {
        color: 'bg-muted-foreground',
        text: 'Checking...',
        pulse: true,
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
