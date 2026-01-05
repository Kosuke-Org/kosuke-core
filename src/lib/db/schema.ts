import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// File type enum for attachments
export const fileTypeEnum = pgEnum('file_type', ['image', 'document']);
export type FileType = (typeof fileTypeEnum.enumValues)[number];

// Build status enum
export const buildStatusEnum = pgEnum('build_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type BuildStatus = (typeof buildStatusEnum.enumValues)[number];

// Task status enum
export const taskStatusEnum = pgEnum('task_status', [
  'todo',
  'in_progress',
  'done',
  'error',
  'cancelled',
]);
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];

// Project status enum for B2C flow
export const projectStatusEnum = pgEnum('project_status', [
  'requirements',
  'requirements_ready',
  'environments_ready',
  'waiting_for_payment',
  'paid',
  'in_development',
  'active',
]);
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  orgId: text('org_id'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isArchived: boolean('is_archived').default(false),
  isImported: boolean('is_imported').default(false).notNull(),
  githubRepoUrl: text('github_repo_url'),
  githubOwner: text('github_owner'),
  githubRepoName: text('github_repo_name'),
  githubBranch: text('github_branch').default('main'),
  autoCommit: boolean('auto_commit').default(true),
  lastGithubSync: timestamp('last_github_sync'),
  defaultBranch: varchar('default_branch', { length: 100 }).default('main'),
  githubWebhookId: integer('github_webhook_id'), // GitHub webhook ID for cleanup on project deletion
  githubInstallationId: integer('github_installation_id'), // GitHub App installation ID for this repo (null = use env var for Kosuke-Org)
  // B2C flow: Requirements gathering workflow
  status: projectStatusEnum('status').notNull().default('requirements'),
  requirementsCompletedAt: timestamp('requirements_completed_at'),
  requirementsCompletedBy: text('requirements_completed_by'),
  // B2C flow: Payment - Stripe invoice URL for waiting_for_payment status
  stripeInvoiceUrl: text('stripe_invoice_url'),
});

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id'), // No FK
    title: varchar('title', { length: 100 }).notNull(),
    description: text('description'),
    branchName: varchar('branch_name', { length: 255 }).notNull(), // Full GitHub branch name (e.g., "kosuke/chat-abc123" or "feature/my-feature")
    status: varchar('status', { length: 20 }).default('active'), // active, archived, completed
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    lastActivityAt: timestamp('last_activity_at').notNull().defaultNow(),
    messageCount: integer('message_count').default(0),
    isDefault: boolean('is_default').default(false),
    // Claude AI session ID for maintaining conversation context during plan clarifications
    claudeSessionId: varchar('claude_session_id', { length: 100 }),
    // GitHub PR/merge status
    branchMergedAt: timestamp('branch_merged_at'),
    branchMergedBy: varchar('branch_merged_by', { length: 100 }),
    mergeCommitSha: varchar('merge_commit_sha', { length: 40 }),
    pullRequestNumber: integer('pull_request_number'),
  },
  table => ({
    lastActivityAtIdx: index('idx_chat_sessions_last_activity_at').on(table.lastActivityAt),
    // Branch name is unique within a project
    projectBranchUnique: unique('chat_sessions_project_branch_unique').on(
      table.projectId,
      table.branchName
    ),
  })
);

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .references(() => projects.id)
    .notNull(),
  chatSessionId: uuid('chat_session_id')
    .references(() => chatSessions.id, { onDelete: 'cascade' })
    .notNull(), // Make this NOT NULL - all messages must be tied to a session
  userId: text('user_id'), // No FK
  role: varchar('role', { length: 20 }).notNull(), // 'user' or 'assistant'
  content: text('content'), // For user messages (nullable for assistant messages)
  blocks: jsonb('blocks'), // For assistant message blocks (text, thinking, tools)
  modelType: varchar('model_type', { length: 20 }), // 'default' or 'premium'
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  tokensInput: integer('tokens_input'), // Number of tokens sent to the model
  tokensOutput: integer('tokens_output'), // Number of tokens received from the model
  contextTokens: integer('context_tokens'), // Current context window size in tokens
  commitSha: text('commit_sha'), // NEW: Git commit SHA for revert functionality
  metadata: jsonb('metadata'), // NEW: System message metadata (e.g., revert info)
});

export const attachments = pgTable('attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  filename: text('filename').notNull(), // Original filename
  storedFilename: text('stored_filename').notNull(), // Sanitized filename in storage
  fileUrl: text('file_url').notNull(), // Full URL to the file
  fileType: fileTypeEnum('file_type').notNull(), // 'image' or 'document' - database-level validation
  mediaType: varchar('media_type', { length: 100 }).notNull(), // MIME type: image/jpeg, image/png, application/pdf
  fileSize: integer('file_size'), // File size in bytes
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const messageAttachments = pgTable('message_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id')
    .references(() => chatMessages.id, { onDelete: 'cascade' })
    .notNull(),
  attachmentId: uuid('attachment_id')
    .references(() => attachments.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// B2C flow: Requirements gathering messages
export const requirementsMessages = pgTable('requirements_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  userId: text('user_id'), // Clerk user ID
  role: varchar('role', { length: 20 }).notNull(), // 'user' or 'assistant'
  content: text('content'), // For user messages (nullable for assistant messages)
  blocks: jsonb('blocks'), // For assistant message blocks (text, thinking, tools)
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});

// B2C flow: Project audit logs for status changes
export const projectAuditLogs = pgTable(
  'project_audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id'), // Clerk user ID or 'system' for automated changes
    action: varchar('action', { length: 50 }).notNull(), // 'status_changed', 'requirements_confirmed', etc.
    previousValue: text('previous_value'),
    newValue: text('new_value'),
    metadata: jsonb('metadata'), // Additional context
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => ({
    projectIdx: index('idx_project_audit_logs_project').on(table.projectId),
    actionIdx: index('idx_project_audit_logs_action').on(table.action),
  })
);

export const diffs = pgTable('diffs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .references(() => projects.id)
    .notNull(),
  chatMessageId: uuid('chat_message_id')
    .references(() => chatMessages.id)
    .notNull(),
  filePath: text('file_path').notNull(),
  content: text('content').notNull(), // The diff content
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending', 'applied', 'rejected'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  appliedAt: timestamp('applied_at'),
});

export const projectCommits = pgTable('project_commits', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  commitSha: text('commit_sha').notNull(),
  commitMessage: text('commit_message').notNull(),
  commitUrl: text('commit_url'),
  filesChanged: integer('files_changed').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const githubSyncSessions = pgTable('github_sync_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  triggerType: varchar('trigger_type', { length: 50 }).notNull(), // 'manual', 'webhook', 'cron'
  status: varchar('status', { length: 20 }).default('running'), // 'running', 'completed', 'failed'
  changes: jsonb('changes'),
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  logs: text('logs'),
});

export const projectEnvironmentVariables = pgTable(
  'project_environment_variables',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    isSecret: boolean('is_secret').default(false),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  table => ({
    uniqueProjectKey: unique('project_env_vars_unique_key').on(table.projectId, table.key),
  })
);

export const projectIntegrations = pgTable(
  'project_integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    integrationType: text('integration_type').notNull(), // 'clerk', 'polar', 'stripe', 'custom'
    integrationName: text('integration_name').notNull(),
    config: text('config').notNull().default('{}'), // JSON string
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  table => ({
    uniqueProjectIntegration: unique('project_integrations_unique_key').on(
      table.projectId,
      table.integrationType,
      table.integrationName
    ),
  })
);

// Build jobs - tracks build execution per session
export const buildJobs = pgTable(
  'build_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chatSessionId: uuid('chat_session_id')
      .references(() => chatSessions.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),

    // Claude planning session that produced this build (for audit trail)
    claudeSessionId: varchar('claude_session_id', { length: 100 }),

    // Git commit SHA before build starts (for revert on cancel)
    startCommit: varchar('start_commit', { length: 40 }),

    // Status
    status: buildStatusEnum('status').notNull().default('pending'),

    // Cost
    totalCost: real('total_cost').default(0),

    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
  },
  table => ({
    sessionIdx: index('idx_build_jobs_session').on(table.chatSessionId),
    statusIdx: index('idx_build_jobs_status').on(table.status),
  })
);

// Tasks - individual task records for builds
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    buildJobId: uuid('build_job_id')
      .references(() => buildJobs.id, { onDelete: 'cascade' })
      .notNull(),

    // Task details
    externalId: varchar('external_id', { length: 100 }).notNull(), // From kosuke-cli (ticket.id)
    title: text('title').notNull(),
    description: text('description').notNull(),
    type: varchar('type', { length: 50 }),
    category: varchar('category', { length: 50 }),
    estimatedEffort: integer('estimated_effort').notNull().default(1),
    order: integer('order').notNull(),
    // Status
    status: taskStatusEnum('status').notNull().default('todo'),

    // Error details
    error: text('error'),

    // Cost tracking
    cost: real('cost').default(0),

    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => ({
    buildJobIdx: index('idx_tasks_build_job').on(table.buildJobId),
    statusIdx: index('idx_tasks_status').on(table.status),
    externalIdIdx: index('idx_tasks_external_id').on(table.externalId),
  })
);

// Environment job status enum (reuses build_status pattern)
export const environmentJobStatusEnum = pgEnum('environment_job_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);
export type EnvironmentJobStatus = (typeof environmentJobStatusEnum.enumValues)[number];

// Environment jobs - tracks environment analysis execution per project
export const environmentJobs = pgTable(
  'environment_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),

    // Status
    status: environmentJobStatusEnum('status').notNull().default('pending'),

    // Error message if failed
    error: text('error'),

    // Number of environment variables found
    variableCount: integer('variable_count'),

    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
  },
  table => ({
    projectIdx: index('idx_environment_jobs_project').on(table.projectId),
    statusIdx: index('idx_environment_jobs_status').on(table.status),
  })
);

export const projectsRelations = relations(projects, ({ many }) => ({
  chatMessages: many(chatMessages),
  chatSessions: many(chatSessions),
  diffs: many(diffs),
  commits: many(projectCommits),
  githubSyncSessions: many(githubSyncSessions),
  requirementsMessages: many(requirementsMessages),
  auditLogs: many(projectAuditLogs),
  environmentJobs: many(environmentJobs),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  project: one(projects, {
    fields: [chatSessions.projectId],
    references: [projects.id],
  }),
  messages: many(chatMessages),
  buildJobs: many(buildJobs),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one, many }) => ({
  project: one(projects, {
    fields: [chatMessages.projectId],
    references: [projects.id],
  }),
  chatSession: one(chatSessions, {
    fields: [chatMessages.chatSessionId],
    references: [chatSessions.id],
  }),
  diffs: many(diffs),
  messageAttachments: many(messageAttachments),
}));

export const attachmentsRelations = relations(attachments, ({ one, many }) => ({
  project: one(projects, {
    fields: [attachments.projectId],
    references: [projects.id],
  }),
  messageAttachments: many(messageAttachments),
}));

export const messageAttachmentsRelations = relations(messageAttachments, ({ one }) => ({
  message: one(chatMessages, {
    fields: [messageAttachments.messageId],
    references: [chatMessages.id],
  }),
  attachment: one(attachments, {
    fields: [messageAttachments.attachmentId],
    references: [attachments.id],
  }),
}));

export const requirementsMessagesRelations = relations(requirementsMessages, ({ one }) => ({
  project: one(projects, {
    fields: [requirementsMessages.projectId],
    references: [projects.id],
  }),
}));

export const projectAuditLogsRelations = relations(projectAuditLogs, ({ one }) => ({
  project: one(projects, {
    fields: [projectAuditLogs.projectId],
    references: [projects.id],
  }),
}));

export const diffsRelations = relations(diffs, ({ one }) => ({
  project: one(projects, {
    fields: [diffs.projectId],
    references: [projects.id],
  }),
  chatMessage: one(chatMessages, {
    fields: [diffs.chatMessageId],
    references: [chatMessages.id],
  }),
}));

export const projectCommitsRelations = relations(projectCommits, ({ one }) => ({
  project: one(projects, {
    fields: [projectCommits.projectId],
    references: [projects.id],
  }),
}));

export const githubSyncSessionsRelations = relations(githubSyncSessions, ({ one }) => ({
  project: one(projects, {
    fields: [githubSyncSessions.projectId],
    references: [projects.id],
  }),
}));

export const projectEnvironmentVariablesRelations = relations(
  projectEnvironmentVariables,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectEnvironmentVariables.projectId],
      references: [projects.id],
    }),
  })
);

export const projectIntegrationsRelations = relations(projectIntegrations, ({ one }) => ({
  project: one(projects, {
    fields: [projectIntegrations.projectId],
    references: [projects.id],
  }),
}));

// Organization API keys - for BYOK (Bring Your Own Key) functionality
export const organizationApiKeys = pgTable('organization_api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: text('org_id').notNull().unique(), // Clerk organization ID
  anthropicApiKey: text('anthropic_api_key'), // Encrypted with AES-256
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type OrganizationApiKey = typeof organizationApiKeys.$inferSelect;
export type NewOrganizationApiKey = typeof organizationApiKeys.$inferInsert;

// User GitHub connections - stores GitHub App OAuth tokens per user
export const userGithubConnections = pgTable('user_github_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(), // Clerk user ID
  githubAccessToken: text('github_access_token').notNull(), // GitHub App user access token
  githubRefreshToken: text('github_refresh_token'), // Refresh token (if available)
  githubTokenExpiresAt: timestamp('github_token_expires_at'), // Token expiration
  githubUserId: integer('github_user_id').notNull(), // GitHub user ID
  githubUsername: varchar('github_username', { length: 255 }).notNull(), // GitHub username
  githubAvatarUrl: text('github_avatar_url'), // GitHub avatar URL
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type UserGithubConnection = typeof userGithubConnections.$inferSelect;
export type NewUserGithubConnection = typeof userGithubConnections.$inferInsert;

export const buildJobsRelations = relations(buildJobs, ({ one, many }) => ({
  chatSession: one(chatSessions, {
    fields: [buildJobs.chatSessionId],
    references: [chatSessions.id],
  }),
  project: one(projects, {
    fields: [buildJobs.projectId],
    references: [projects.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  buildJob: one(buildJobs, {
    fields: [tasks.buildJobId],
    references: [buildJobs.id],
  }),
}));

export const environmentJobsRelations = relations(environmentJobs, ({ one }) => ({
  project: one(projects, {
    fields: [environmentJobs.projectId],
    references: [projects.id],
  }),
}));

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type NewMessageAttachment = typeof messageAttachments.$inferInsert;
export type Diff = typeof diffs.$inferSelect;
export type NewDiff = typeof diffs.$inferInsert;
export type ProjectCommit = typeof projectCommits.$inferSelect;
export type NewProjectCommit = typeof projectCommits.$inferInsert;
export type GithubSyncSession = typeof githubSyncSessions.$inferSelect;
export type NewGithubSyncSession = typeof githubSyncSessions.$inferInsert;
export type ProjectEnvironmentVariable = typeof projectEnvironmentVariables.$inferSelect;
export type NewProjectEnvironmentVariable = typeof projectEnvironmentVariables.$inferInsert;
export type ProjectIntegration = typeof projectIntegrations.$inferSelect;
export type NewProjectIntegration = typeof projectIntegrations.$inferInsert;
export type BuildJob = typeof buildJobs.$inferSelect;
export type NewBuildJob = typeof buildJobs.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type RequirementsMessage = typeof requirementsMessages.$inferSelect;
export type NewRequirementsMessage = typeof requirementsMessages.$inferInsert;
export type ProjectAuditLog = typeof projectAuditLogs.$inferSelect;
export type NewProjectAuditLog = typeof projectAuditLogs.$inferInsert;
export type EnvironmentJob = typeof environmentJobs.$inferSelect;
export type NewEnvironmentJob = typeof environmentJobs.$inferInsert;
