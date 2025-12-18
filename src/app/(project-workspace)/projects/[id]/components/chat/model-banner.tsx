'use client';

import { cn } from '@/lib/utils';

interface ModelBannerProps {
  className?: string;
  model?: string;
}

export default function ModelBanner({ className, model }: ModelBannerProps) {
  // Format model name for display
  const getModelDisplayName = (modelId?: string) => {
    if (!modelId) return 'Unknown';
    if (modelId.includes('claude-sonnet-4-5')) return 'Claude Sonnet 4.5';
    if (modelId.includes('claude-haiku-4-5')) return 'Claude Haiku 4.5';
    if (modelId.includes('claude-opus-4-5')) return 'Claude Opus 4.5';
    return modelId;
  };

  const modelName = getModelDisplayName(model);

  return (
    <div className={cn('px-4', className)}>
      <div className="flex items-center w-full px-4 py-2.5 rounded-md bg-gradient-to-r from-primary/5 to-background">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Powered by:</span>
          <span className="text-xs font-medium">{modelName}</span>
        </div>
      </div>
    </div>
  );
}
