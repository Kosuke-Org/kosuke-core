export interface PreviewUrl {
  id: string;
  branch_name: string;
  full_url: string;
  container_status: 'running' | 'stopped' | 'error';
  created_at: string;
}

export interface PreviewUrlsResponse {
  preview_urls: PreviewUrl[];
  total_count: number;
}
