import type { FontInfo } from '@/lib/types/branding';
import { useQuery } from '@tanstack/react-query';

interface FontsResponse {
  fonts: FontInfo[];
}

// Hook for fetching brand fonts (session-specific)
export function useBrandFonts(projectId: string, sessionId: string) {
  return useQuery({
    queryKey: ['brand-fonts', projectId, sessionId],
    queryFn: async (): Promise<FontsResponse> => {
      const response = await fetch(
        `/api/projects/${projectId}/chat-sessions/${sessionId}/branding/fonts`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch fonts: ${response.statusText}`);
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 10, // 10 minutes (fonts change less frequently)
    retry: 1,
    enabled: !!sessionId, // Don't fetch if no sessionId
  });
}
