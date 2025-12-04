import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// File type enum for attachments
export const fileTypeEnum = pgEnum('file_type', ['image', 'document']);
export type FileType = (typeof fileTypeEnum.enumValues)[number];

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
    sessionId: varchar('session_id', { length: 50 }).notNull(), // Unique per project, not globally
    remoteId: varchar('remote_id', { length: 255 }).unique(), // Claude Agent SDK session ID for resuming conversations
    status: varchar('status', { length: 20 }).default('active'), // active, archived, completed
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    lastActivityAt: timestamp('last_activity_at').notNull().defaultNow(),
    messageCount: integer('message_count').default(0),
    isDefault: boolean('is_default').default(false),
    // GitHub merge status
    branchMergedAt: timestamp('branch_merged_at'),
    branchMergedBy: varchar('branch_merged_by', { length: 100 }),
    mergeCommitSha: varchar('merge_commit_sha', { length: 40 }),
    pullRequestNumber: integer('pull_request_number'),
  },
  table => ({
    lastActivityAtIdx: index('idx_chat_sessions_last_activity_at').on(table.lastActivityAt),
    // Session ID is unique within a project (allows "main" for each project)
    projectSessionUnique: unique('chat_sessions_project_session_unique').on(
      table.projectId,
      table.sessionId
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

export const projectsRelations = relations(projects, ({ many }) => ({
  chatMessages: many(chatMessages),
  chatSessions: many(chatSessions),
  diffs: many(diffs),
  commits: many(projectCommits),
  githubSyncSessions: many(githubSyncSessions),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  project: one(projects, {
    fields: [chatSessions.projectId],
    references: [projects.id],
  }),
  messages: many(chatMessages),
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
