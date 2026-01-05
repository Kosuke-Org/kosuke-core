import type {
  CreateRepositoryFromTemplateRequest,
  GitHubRepoResponse,
  GitHubRepository,
} from '@/lib/types/github';
import crypto from 'crypto';

import {
  createKosukeOrgOctokit,
  getInstallationForRepo,
  GITHUB_APP_INSTALL_URL,
  listUserRepositoriesWithAppStatus,
  userHasGitHubConnected,
} from './installations';

// Re-export the GitHubRepository type for use in hooks/components
export type { GitHubRepository } from '@/lib/types/github';

/**
 * List all repositories the user has access to with their app installation status.
 * Returns ALL repos - those with app installed can be imported, others show install prompt.
 */
export async function listUserRepositories(
  userId: string,
  page: number = 1,
  perPage: number = 10,
  search: string = ''
): Promise<{
  repositories: GitHubRepository[];
  hasMore: boolean;
  needsGitHubConnection: boolean;
  installUrl: string;
}> {
  // Check if user has GitHub connected
  const hasGitHub = await userHasGitHubConnected(userId);
  if (!hasGitHub) {
    return {
      repositories: [],
      hasMore: false,
      needsGitHubConnection: true,
      installUrl: GITHUB_APP_INSTALL_URL,
    };
  }

  // Get all repos user has access to with their app installation status
  const allRepos = await listUserRepositoriesWithAppStatus(userId);

  // Filter by search term if provided
  let filteredRepos = allRepos;
  if (search) {
    const searchLower = search.toLowerCase();
    filteredRepos = allRepos.filter(
      repo =>
        repo.name.toLowerCase().includes(searchLower) ||
        repo.full_name.toLowerCase().includes(searchLower)
    );
  }

  // Sort: repos with app installed first, then by name
  filteredRepos.sort((a, b) => {
    // First sort by appInstalled (true comes first)
    if (a.appInstalled !== b.appInstalled) {
      return a.appInstalled ? -1 : 1;
    }
    // Then sort alphabetically by full_name
    return a.full_name.localeCompare(b.full_name);
  });

  // Apply pagination
  const start = (page - 1) * perPage;
  const paginatedRepos = filteredRepos.slice(start, start + perPage);

  return {
    repositories: paginatedRepos,
    hasMore: start + perPage < filteredRepos.length,
    needsGitHubConnection: false,
    installUrl: GITHUB_APP_INSTALL_URL,
  };
}

/**
 * Check if the Kosuke App is installed on a repository
 * Returns the installation ID if installed, null otherwise
 */
export async function checkAppInstallation(
  owner: string,
  repo: string
): Promise<{ installationId: number | null; installUrl: string }> {
  const installationId = await getInstallationForRepo(owner, repo);

  return {
    installationId,
    installUrl: GITHUB_APP_INSTALL_URL,
  };
}

/**
 * Create repository in Kosuke organization from template
 */
export async function createRepositoryFromTemplate(
  request: CreateRepositoryFromTemplateRequest
): Promise<GitHubRepoResponse> {
  const octokit = createKosukeOrgOctokit();
  const kosukeOrg = process.env.NEXT_PUBLIC_GITHUB_WORKSPACE;
  if (!kosukeOrg) {
    throw new Error(
      'NEXT_PUBLIC_GITHUB_WORKSPACE not configured. Set it in environment variables.'
    );
  }

  // Parse template repository
  const templateRepo = request.templateRepo;

  if (!templateRepo.includes('/')) {
    throw new Error(`Invalid template repository format: ${templateRepo}. Expected 'owner/repo'`);
  }
  const [templateOwner, templateName] = templateRepo.split('/', 2);

  // Sanitize repo name
  const sanitizedName = request.name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);

  // Validate template repository exists and is a template
  try {
    const { data: template } = await octokit.rest.repos.get({
      owner: templateOwner,
      repo: templateName,
    });

    if (!template.is_template) {
      throw new Error(`Repository ${templateRepo} is not marked as a template repository`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Not Found')) {
      throw new Error(
        `Template repository '${templateRepo}' is not accessible. Please verify it exists and is marked as a template.`
      );
    }
    throw error;
  }

  // Try with clean name first, add random suffix only if taken
  let repoName = sanitizedName;
  try {
    const { data: existingRepo } = await octokit.rest.repos.get({
      owner: kosukeOrg,
      repo: repoName,
    });
    if (existingRepo) {
      // Repo exists, generate unique name with random suffix
      const shortId = crypto.randomBytes(4).toString('hex');
      repoName = `${sanitizedName}-${shortId}`;
      console.log(`Name taken, using unique name: ${repoName}`);
    }
  } catch (error) {
    // If we get a 404, the repo doesn't exist (which is what we want)
    if (error instanceof Error && !error.message.includes('Not Found')) {
      throw error;
    }
  }

  console.log(`Creating repo in ${kosukeOrg}: ${repoName}`);

  // Create repository from template in Kosuke org
  try {
    const { data: repo } = await octokit.rest.repos.createUsingTemplate({
      template_owner: templateOwner,
      template_repo: templateName,
      owner: kosukeOrg,
      name: repoName,
      description: request.description || `Kosuke project: ${request.name}`,
      private: request.private,
      include_all_branches: false,
    });

    console.log(`✅ Successfully created repository: ${repo.full_name}`);

    return {
      name: repo.name,
      owner: kosukeOrg,
      url: repo.clone_url || '',
      private: repo.private,
      description: repo.description || undefined,
    };
  } catch (error) {
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes('already exists') || errorMessage.includes('name already exists')) {
        throw new Error('Repository name already exists in Kosuke organization');
      }

      if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
        throw new Error('Kosuke service token lacks permissions. Check token scopes.');
      }

      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        throw new Error(`Template repository '${templateRepo}' not found or not accessible`);
      }

      if (errorMessage.includes('422') || errorMessage.includes('validation')) {
        throw new Error(`Validation error: ${error.message}`);
      }
    }

    throw new Error(
      `Failed to create repository: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
