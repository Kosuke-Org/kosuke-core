/**
 * Git Service
 * Handles git operations within the sandbox
 */

import { simpleGit, type SimpleGit } from 'simple-git';

const PROJECT_DIR = process.env.PROJECT_DIR || '/app/project';

interface CommitResult {
  sha: string | null;
  message: string;
}

interface PullResult {
  success: boolean;
  changed: boolean;
  error?: string;
}

export class GitService {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit(PROJECT_DIR);
  }

  /**
   * Commit all changes and push to remote
   */
  async commitAndPush(githubToken: string): Promise<CommitResult> {
    // Check for changes
    const status = await this.git.status();

    const hasChanges =
      status.modified.length > 0 ||
      status.not_added.length > 0 ||
      status.deleted.length > 0 ||
      status.created.length > 0;

    if (!hasChanges) {
      return { sha: null, message: 'No changes to commit' };
    }

    // Stage all changes
    await this.git.add('-A');

    // Generate commit message
    const changedFiles = [
      ...status.modified,
      ...status.not_added,
      ...status.deleted,
      ...status.created,
    ];

    const filesSummary = changedFiles.slice(0, 5).join(', ');
    const moreFiles = changedFiles.length > 5 ? ` and ${changedFiles.length - 5} more` : '';
    const message = `Update: ${filesSummary}${moreFiles}\n\nModified by Kosuke Agent`;

    // Commit (skip pre-commit hooks for agent commits)
    const commitResult = await this.git.commit(message, { '--no-verify': null });
    const sha = commitResult.commit || null;

    if (!sha) {
      return { sha: null, message: 'No changes committed' };
    }

    console.log(`✅ Changes committed: ${sha.substring(0, 8)}`);

    // Push with authentication
    try {
      await this.pushWithToken(githubToken);
      console.log(`✅ Changes pushed to remote`);
    } catch (err) {
      console.error('Failed to push:', err);
      // Don't throw - commit was successful
    }

    return { sha, message: 'Changes committed and pushed' };
  }

  /**
   * Pull latest changes from remote
   */
  async pull(branch: string, githubToken: string): Promise<PullResult> {
    try {
      // Get current commit
      const beforeCommit = await this.git.revparse(['HEAD']);

      // Get remote info
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');

      if (!origin) {
        throw new Error('No origin remote found');
      }

      const authUrl = this.buildAuthUrl(origin.refs.fetch, githubToken);
      const originalUrl = origin.refs.fetch;

      // Temporarily set authenticated URL
      await this.git.remote(['set-url', 'origin', authUrl]);

      try {
        // Fetch and reset
        console.log(`📥 Fetching ${branch} from remote...`);
        await this.git.fetch('origin', branch);
        await this.git.reset(['--hard', `origin/${branch}`]);
      } finally {
        // Always restore original URL (without token)
        await this.git.remote(['set-url', 'origin', originalUrl]);
      }

      // Check if changes occurred
      const afterCommit = await this.git.revparse(['HEAD']);
      const changed = beforeCommit !== afterCommit;

      if (changed) {
        console.log(
          `✅ Pulled changes: ${beforeCommit.substring(0, 8)} → ${afterCommit.substring(0, 8)}`
        );
      } else {
        console.log(`ℹ️ Already up to date`);
      }

      return { success: true, changed };
    } catch (err) {
      console.error('Pull failed:', err);
      return {
        success: false,
        changed: false,
        error: err instanceof Error ? err.message : 'Pull failed',
      };
    }
  }

  /**
   * Push with authentication
   */
  private async pushWithToken(githubToken: string): Promise<void> {
    const remotes = await this.git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');

    if (!origin) {
      throw new Error('No origin remote found');
    }

    const pushUrl = origin.refs.push || origin.refs.fetch;
    const authUrl = this.buildAuthUrl(pushUrl, githubToken);
    const originalUrl = pushUrl;

    // Get current branch
    const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);

    // Temporarily set authenticated URL
    await this.git.remote(['set-url', 'origin', authUrl]);

    try {
      console.log(`📤 Pushing to ${branch}...`);
      await this.git.push('origin', branch, ['--set-upstream']);
    } finally {
      // Always restore original URL (without token)
      await this.git.remote(['set-url', 'origin', originalUrl]);
    }
  }

  /**
   * Build authenticated GitHub URL
   */
  private buildAuthUrl(url: string, token: string): string {
    if (url.includes('github.com')) {
      const match = url.match(/github\.com[/:]([\w-]+)\/([\w.-]+?)(?:\.git)?$/);
      if (match) {
        const [, owner, repo] = match;
        return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
      }
    }
    return url;
  }
}
