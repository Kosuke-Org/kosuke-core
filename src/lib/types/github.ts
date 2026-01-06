// GitHub Integration Types

// Repository from user's GitHub account (may or may not have Kosuke app installed)
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
  };
  html_url: string;
  clone_url: string;
  default_branch: string;
  // Whether the Kosuke GitHub App is installed on this repository
  appInstalled: boolean;
  // Installation ID (only present if appInstalled is true)
  installationId: number | null;
}

// Repository creation from template
export interface CreateRepositoryFromTemplateRequest {
  name: string;
  description?: string;
  private: boolean;
  templateRepo: string;
}

export interface GitHubRepoResponse {
  name: string;
  owner: string;
  url: string;
  private: boolean;
  description?: string;
}
