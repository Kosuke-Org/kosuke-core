/**
 * Git Operations
 * Handles Git operations for session branches using simple-git
 * Manages commits, pushes, and change detection
 */

import type { CommitOptions, GitChangesSummary, GitHubCommit } from '@/lib/types/agent';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import simpleGit, { type SimpleGit } from 'simple-git';

/**
 * Git Operations Service
 * Provides Git functionality for session-based development
 */
export class GitOperations {
  private projectsBasePath: string;
  private sessionBranchPrefix: string;

  constructor() {
    const projectsBasePath = process.env.PROJECTS_BASE_PATH;
    if (!projectsBasePath) {
      throw new Error('PROJECTS_BASE_PATH environment variable is required');
    }

    const sessionBranchPrefix = process.env.SESSION_BRANCH_PREFIX;
    if (!sessionBranchPrefix) {
      throw new Error('SESSION_BRANCH_PREFIX environment variable is required');
    }

    this.projectsBasePath = projectsBasePath;
    this.sessionBranchPrefix = sessionBranchPrefix;
  }

  /**
   * Clone a GitHub repository to the local project directory
   */
  async cloneRepository(repoUrl: string, projectId: string, githubToken: string): Promise<string> {
    try {
      const projectPath = join(this.projectsBasePath, projectId);

      // Remove existing project directory if it exists
      if (existsSync(projectPath)) {
        console.log(`🗑️ Removing existing project directory: ${projectPath}`);
        rmSync(projectPath, { recursive: true, force: true });
      }

      // Build authenticated URL for cloning
      const authenticatedUrl = this.buildAuthenticatedUrl(repoUrl, githubToken);
      const sanitizedUrl = this.sanitizeUrlForLog(repoUrl);

      console.log(`📦 Cloning repository ${sanitizedUrl} to project ${projectId}`);

      // Clone repository
      await simpleGit().clone(authenticatedUrl, projectPath);

      // After clone, sanitize remote URL to remove token
      try {
        const git = simpleGit(projectPath);
        const sanitizedRepoUrl = this.sanitizeRepoUrl(repoUrl);
        await git.remote(['set-url', 'origin', sanitizedRepoUrl]);
        console.log('🔒 Sanitized remote URL to remove credentials');
      } catch (sanitizeError) {
        // Non-fatal if we cannot sanitize
        console.warn('⚠️ Failed to sanitize remote URL after clone:', sanitizeError);
      }

      console.log(`✅ Successfully cloned repository to project ${projectId}`);
      console.log('ℹ️ Repository kept on main branch - branches will be created per chat session');

      return projectPath;
    } catch (error) {
      console.error(`❌ Error cloning repository:`, error);
      throw new Error(
        `Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Sanitize repository URL to remove credentials
   */
  private sanitizeRepoUrl(repoUrl: string): string {
    try {
      // Convert SSH to HTTPS
      if (repoUrl.startsWith('git@github.com:')) {
        const repoPath = repoUrl.replace('git@github.com:', '');
        return `https://github.com/${repoPath.endsWith('.git') ? repoPath : `${repoPath}.git`}`;
      }

      // Remove embedded credentials from HTTPS URL
      if (repoUrl.startsWith('https://')) {
        return repoUrl.replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/');
      }

      return repoUrl;
    } catch (error) {
      console.warn('⚠️ Error sanitizing repo URL:', error);
      return repoUrl;
    }
  }

  /**
   * Commit all changes in a session directory and push to GitHub
   */
  async commitSessionChanges(options: CommitOptions): Promise<GitHubCommit | null> {
    console.log(`🔧 Starting commit for session ${options.sessionId}`);

    try {
      const git = simpleGit(options.sessionPath);
      const branchName = `${this.sessionBranchPrefix}${options.sessionId}`;

      // Detect changes before doing anything
      const changes = await this.detectChanges(git);

      if (changes.changedFiles.length === 0) {
        console.log(`ℹ️ No changes detected in session ${options.sessionId}`);
        return null;
      }

      console.log(`📝 Detected ${changes.changedFiles.length} changed files`);

      // Manage branch (create or switch to session branch)
      await this.checkoutChatBranch(git, branchName);

      // Add all changes
      await this.addAllChanges(git, changes.changedFiles);

      // Generate commit message
      const commitMessage = this.generateCommitMessage(
        options.message,
        changes.changedFiles,
        options.sessionId
      );

      // Commit changes
      const commitResult = await git.commit(commitMessage);
      const commitSha = commitResult.commit;

      console.log(`✅ Created commit: ${commitSha.substring(0, 8)}`);

      // Push to remote
      await this.pushToRemote(git, branchName, options.githubToken);

      // Get commit URL
      const remoteUrl = await this.getRemoteUrl(git);
      const commitUrl = this.buildCommitUrl(remoteUrl, commitSha);

      return {
        sha: commitSha,
        message: commitMessage,
        url: commitUrl,
        filesChanged: changes.changedFiles.length,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error(`❌ Error committing changes for session ${options.sessionId}:`, error);
      throw new Error(
        `Failed to commit changes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Detect all changes in the working directory
   */
  private async detectChanges(git: SimpleGit): Promise<GitChangesSummary> {
    try {
      const status = await git.status();

      const changedFiles: string[] = [
        ...status.modified,
        ...status.created,
        ...status.deleted,
        ...status.renamed.map(r => r.to),
        ...status.not_added.filter(file => !this.shouldIgnoreFile(file)),
      ];

      // Remove duplicates
      const uniqueFiles = [...new Set(changedFiles)];

      console.log(`📊 Git status: ${uniqueFiles.length} files changed`);

      return {
        changedFiles: uniqueFiles,
        additions: status.created.length,
        deletions: status.deleted.length,
      };
    } catch (error) {
      console.error('❌ Error detecting changes:', error);
      return {
        changedFiles: [],
        additions: 0,
        deletions: 0,
      };
    }
  }

  /**
   * Create or switch to a session-specific branch
   */
  private async checkoutChatBranch(git: SimpleGit, branchName: string): Promise<void> {
    try {
      const branches = await git.branchLocal();

      if (branches.all.includes(branchName)) {
        // Branch exists, switch to it
        await git.checkout(branchName);
        console.log(`🔀 Switched to existing branch: ${branchName}`);
      } else {
        // Create new branch from current state
        await git.checkoutLocalBranch(branchName);
        console.log(`🆕 Created new branch: ${branchName}`);
      }
    } catch (error) {
      console.error(`❌ Error managing branch ${branchName}:`, error);
      throw new Error(
        `Failed to manage Git branch: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Add all changed files to the Git index
   */
  private async addAllChanges(git: SimpleGit, files: string[]): Promise<void> {
    try {
      if (files.length > 0) {
        await git.add(files);
        console.log(`✅ Added ${files.length} files to Git index`);
      }
    } catch (error) {
      console.error('❌ Error adding files to Git index:', error);
      throw new Error(
        `Failed to add files: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate a meaningful commit message
   */
  private generateCommitMessage(
    customMessage: string | undefined,
    filesChanged: string[],
    sessionId: string
  ): string {
    if (customMessage) {
      return customMessage;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

    if (filesChanged.length <= 3) {
      const fileSummary = filesChanged.join(', ');
      return `${this.sessionBranchPrefix}${timestamp}: Modified ${fileSummary} (chat: ${sessionId.substring(0, 8)})`;
    } else {
      return `${this.sessionBranchPrefix}${timestamp}: Modified ${filesChanged.length} files (chat: ${sessionId.substring(0, 8)})`;
    }
  }

  /**
   * Push branch to GitHub remote with authentication
   */
  private async pushToRemote(
    git: SimpleGit,
    branchName: string,
    githubToken: string
  ): Promise<void> {
    try {
      // Get original remote URL
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');

      if (!origin || !origin.refs.push) {
        throw new Error('No origin remote found');
      }

      const originalUrl = origin.refs.push;
      console.log(`🔗 Original remote URL: ${this.sanitizeUrlForLog(originalUrl)}`);

      // Build authenticated URL
      const authenticatedUrl = this.buildAuthenticatedUrl(originalUrl, githubToken);

      // Temporarily update remote URL for push
      await git.remote(['set-url', 'origin', authenticatedUrl]);

      try {
        // Try to push; create upstream if needed
        try {
          await git.push('origin', branchName);
          console.log(`⬆️ Pushed to branch: ${branchName}`);
        } catch {
          // Branch might not exist on remote, create it with upstream
          await git.push('origin', branchName, ['--set-upstream']);
          console.log(`⬆️ Created and pushed new branch: ${branchName}`);
        }
      } finally {
        // Always restore original URL
        await git.remote(['set-url', 'origin', originalUrl]);
        console.log('🔄 Restored original remote URL');
      }
    } catch (error) {
      console.error('❌ Error pushing to remote:', error);
      throw new Error(
        `Failed to push to GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Build authenticated GitHub URL with token
   */
  private buildAuthenticatedUrl(repoUrl: string, token: string): string {
    try {
      // Handle HTTPS URLs
      if (repoUrl.startsWith('https://github.com/')) {
        return repoUrl.replace('https://github.com/', `https://oauth2:${token}@github.com/`);
      }

      // Handle SSH URLs (convert to HTTPS with auth)
      if (repoUrl.startsWith('git@github.com:')) {
        const repoPath = repoUrl.replace('git@github.com:', '').replace('.git', '');
        return `https://oauth2:${token}@github.com/${repoPath}.git`;
      }

      // Return original if format is unexpected
      console.warn(`⚠️ Unexpected remote URL format: ${repoUrl}`);
      return repoUrl;
    } catch (error) {
      console.error('❌ Error building authenticated URL:', error);
      return repoUrl;
    }
  }

  /**
   * Get remote URL for building commit links
   */
  private async getRemoteUrl(git: SimpleGit): Promise<string> {
    try {
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      return origin?.refs.fetch || '';
    } catch (error) {
      console.error('❌ Error getting remote URL:', error);
      return '';
    }
  }

  /**
   * Build GitHub commit URL from remote URL and SHA
   */
  private buildCommitUrl(remoteUrl: string, commitSha: string): string {
    try {
      // Convert various GitHub URL formats to web URL
      let webUrl = remoteUrl.replace('git@github.com:', 'https://github.com/').replace('.git', '');

      // Remove any embedded credentials
      webUrl = webUrl.replace(/https:\/\/.*@github\.com\//, 'https://github.com/');

      return `${webUrl}/commit/${commitSha}`;
    } catch (error) {
      console.error('❌ Error building commit URL:', error);
      return '';
    }
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnoreFile(filePath: string): boolean {
    const ignorePatterns = [
      '.git/',
      '__pycache__/',
      'node_modules/',
      '.next/',
      'dist/',
      'build/',
      '.env',
      '.env.local',
      '.DS_Store',
      '.pyc',
      '.log',
    ];

    return ignorePatterns.some(pattern => filePath.includes(pattern));
  }

  /**
   * Revert to specific commit in session directory
   * Used for revert operations to restore a previous state
   * Resets the branch to the target commit and force pushes to remote
   */
  async revertToCommit(
    sessionPath: string,
    commitSha: string,
    githubToken: string
  ): Promise<boolean> {
    try {
      console.log(`🔄 Reverting to commit ${commitSha.substring(0, 8)} in ${sessionPath}`);

      // Verify git repository exists
      const gitPath = join(sessionPath, '.git');
      if (!existsSync(gitPath)) {
        console.error(`❌ No git repository found in ${sessionPath}`);
        return false;
      }

      // Initialize git in session directory
      const git: SimpleGit = simpleGit(sessionPath);

      // Get current branch name
      const status = await git.status();
      const currentBranch = status.current;

      if (!currentBranch) {
        console.error(`❌ Could not determine current branch`);
        return false;
      }

      console.log(`Current branch: ${currentBranch}`);

      // Hard reset to the target commit
      await git.reset(['--hard', commitSha]);
      console.log(`✅ Reset branch ${currentBranch} to commit ${commitSha.substring(0, 8)}`);

      // Get remote URL and build authenticated URL
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');

      if (!origin || !origin.refs.push) {
        console.error(`❌ No origin remote found`);
        return false;
      }

      const originalUrl = origin.refs.push;
      const authenticatedUrl = this.buildAuthenticatedUrl(originalUrl, githubToken);

      // Temporarily set authenticated URL
      await git.remote(['set-url', 'origin', authenticatedUrl]);

      try {
        // Force push to remote branch
        console.log(`📤 Force pushing to remote branch ${currentBranch}...`);
        await git.push(['origin', currentBranch, '--force']);
        console.log(`✅ Successfully pushed revert to remote`);
      } finally {
        // Always restore original URL
        await git.remote(['set-url', 'origin', originalUrl]);
      }

      console.log(`✅ Successfully reverted to commit ${commitSha.substring(0, 8)}`);
      return true;
    } catch (error) {
      console.error(`❌ Error during git revert:`, error);
      return false;
    }
  }

  /**
   * Sanitize URL for logging (remove tokens)
   */
  private sanitizeUrlForLog(url: string): string {
    return url.replace(/oauth2:[^@]+@/, 'oauth2:***@').replace(/:[^:@]+@/, ':***@');
  }

  /**
   * Pull latest changes from remote for a specific branch
   * Used by webhook handler to sync main branch after pushes
   */
  async pullChanges(sessionPath: string, branch: string, githubToken: string): Promise<boolean> {
    try {
      console.log(`📥 Pulling latest changes for branch ${branch} in ${sessionPath}`);

      // Verify git repository exists
      const gitPath = join(sessionPath, '.git');
      if (!existsSync(gitPath)) {
        console.error(`❌ No git repository found in ${sessionPath}`);
        return false;
      }

      const git: SimpleGit = simpleGit(sessionPath);

      // Get current branch
      const status = await git.status();
      const currentBranch = status.current;

      // Ensure we're on the correct branch
      if (currentBranch !== branch) {
        console.log(`🔀 Switching from ${currentBranch} to ${branch}`);
        await git.checkout(branch);
      }

      // Get remote URL and build authenticated URL
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');

      if (!origin || !origin.refs.fetch) {
        console.error(`❌ No origin remote found`);
        return false;
      }

      const originalUrl = origin.refs.fetch;
      const authenticatedUrl = this.buildAuthenticatedUrl(originalUrl, githubToken);

      // Temporarily set authenticated URL
      await git.remote(['set-url', 'origin', authenticatedUrl]);

      try {
        // Pull latest changes
        console.log(`📥 Pulling from origin/${branch}...`);
        await git.pull('origin', branch);
        console.log(`✅ Successfully pulled latest changes`);
      } finally {
        // Always restore original URL
        await git.remote(['set-url', 'origin', originalUrl]);
      }

      return true;
    } catch (error) {
      console.error(`❌ Error pulling changes:`, error);
      return false;
    }
  }
}
