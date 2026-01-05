'use client';

interface PoweredByIndicatorProps {
  model?: string;
}

// Format model name for display
const getModelDisplayName = (modelId?: string) => {
  if (!modelId) return 'Unknown';
  if (modelId.includes('claude-sonnet-4-5')) return 'Claude Sonnet 4.5';
  if (modelId.includes('claude-haiku-4-5')) return 'Claude Haiku 4.5';
  if (modelId.includes('claude-opus-4-5')) return 'Claude Opus 4.5';
  return modelId;
};

export default function PoweredByIndicator({ model }: PoweredByIndicatorProps) {
  return (
    <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Powered by:</span>
      <span className="text-xs font-medium text-muted-foreground">
        {getModelDisplayName(model)}
      </span>
    </div>
  );
}
