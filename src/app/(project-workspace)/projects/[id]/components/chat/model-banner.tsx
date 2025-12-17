'use client';

import { cn } from '@/lib/utils';
import { GitBranch } from 'lucide-react';

interface ModelBannerProps {
  className?: string;
  currentBranch?: string;
  chatSessionId?: string | null;
  model?: string;
}

export default function ModelBanner({
  className,
  currentBranch,
  chatSessionId,
  model,
}: ModelBannerProps) {
  // Format model name for display
  const getModelDisplayName = (modelId?: string) => {
    if (!modelId) return 'Unknown';
    if (modelId.includes('claude-sonnet-4')) return 'Claude Sonnet 4';
    if (modelId.includes('claude-haiku-4')) return 'Claude Haiku 4';
    if (modelId.includes('claude-opus-4')) return 'Claude Opus 4';
    return modelId;
  };

  const displayBranch = currentBranch || 'main';
  const modelName = getModelDisplayName(model);

  return (
    <div className={cn('px-4', className)}>
      <div className="flex items-center justify-between w-full px-4 py-2.5 rounded-md bg-gradient-to-r from-primary/5 to-background">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Powered by:</span>
          <span className="text-xs font-medium">{modelName}</span>
        </div>

        {/* Branch Display */}
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{displayBranch}</span>
          {!chatSessionId && <span className="text-xs text-muted-foreground/70">(default)</span>}
        </div>
      </div>
    </div>
  );
}
