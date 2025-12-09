// ============================================
// Git Operations
// ============================================

export interface GitHubCommit {
  sha: string;
  message: string;
  url: string;
  filesChanged: number;
  timestamp: Date;
}

export interface CommitOptions {
  sessionPath: string;
  sessionId: string;
  message?: string;
  githubToken: string;
  userId: string;
}

export interface GitChangesSummary {
  changedFiles: string[];
  additions: number;
  deletions: number;
}
