export interface PreviewUrl {
  id: string;
  branch_name: string;
  full_url: string | null; // null when servicesMode is 'agent-only'
  container_status: 'running' | 'stopped' | 'error' | 'completed';
  created_at: string;
}

export interface PreviewUrlsResponse {
  preview_urls: PreviewUrl[];
  total_count: number;
}
