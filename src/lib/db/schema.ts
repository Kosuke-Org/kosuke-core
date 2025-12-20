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
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ------------------------------------------------------------
// ENUMS
// ------------------------------------------------------------

// File type enum for attachments
export const fileTypeEnum = pgEnum('file_type', ['image', 'document']);
export type FileType = (typeof fileTypeEnum.enumValues)[number];

// Build status enum
export const buildStatusEnum = pgEnum('build_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);
export type BuildStatus = (typeof buildStatusEnum.enumValues)[number];

// Task status enum
export const taskStatusEnum = pgEnum('task_status', ['todo', 'in_progress', 'done', 'error']);
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];

// Agent log status enum
export const agentLogStatusEnum = pgEnum('agent_log_status', ['success', 'error', 'cancelled']);

// Agent log command enum
export const agentLogCommandEnum = pgEnum('agent_log_command', ['requirements', 'plan', 'build']);

// ------------------------------------------------------------
// TABLES
// ------------------------------------------------------------

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
  table => [
    index('idx_chat_sessions_last_activity_at').on(table.lastActivityAt),
    // Branch name is unique within a project
    unique('chat_sessions_project_branch_unique').on(table.projectId, table.branchName),
  ]
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

    // Status
    status: buildStatusEnum('status').notNull().default('pending'),

    // Cost
    totalCost: real('total_cost').default(0),

    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),

    // BullMQ reference
    bullJobId: varchar('bull_job_id', { length: 100 }),
  },
  table => [
    index('idx_build_jobs_session').on(table.chatSessionId),
    index('idx_build_jobs_status').on(table.status),
  ]
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
  table => [
    index('idx_tasks_build_job').on(table.buildJobId),
    index('idx_tasks_status').on(table.status),
    index('idx_tasks_external_id').on(table.externalId),
  ]
);

export const agentLogs = pgTable(
  'agent_logs',
  {
    // Identifiers
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    orgId: text('org_id'),
    userId: text('user_id'),

    // Command Info
    command: agentLogCommandEnum('command').notNull(),
    commandArgs: jsonb('command_args'),

    // Execution Status
    status: agentLogStatusEnum('status').notNull(),
    errorMessage: text('error_message'),

    // Token Usage & Cost
    tokensInput: integer('tokens_input').notNull(),
    tokensOutput: integer('tokens_output').notNull(),
    tokensCacheCreation: integer('tokens_cache_creation').default(0),
    tokensCacheRead: integer('tokens_cache_read').default(0),
    cost: varchar('cost', { length: 20 }).notNull(), // Stored as string to avoid decimal precision issues

    // Performance
    executionTimeMs: integer('execution_time_ms').notNull(),
    inferenceTimeMs: integer('inference_time_ms'),

    // Command-Specific Results
    fixesApplied: integer('fixes_applied'),
    testsRun: integer('tests_run'),
    testsPassed: integer('tests_passed'),
    testsFailed: integer('tests_failed'),
    iterations: integer('iterations'),
    filesModified: jsonb('files_modified'), // Array of file paths

    // Kosuke CLI version
    agentVersion: varchar('agent_version', { length: 50 }),

    // Conversation Data (full capture for tickets/requirements commands)
    conversationMessages: jsonb('conversation_messages'), // Array of { role, content, timestamp, toolCalls }

    // Timestamps
    startedAt: timestamp('started_at').notNull(),
    completedAt: timestamp('completed_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    // Indexes for performance
    index('idx_agent_logs_project_id').on(table.projectId),
    index('idx_agent_logs_org_id').on(table.orgId),
    index('idx_agent_logs_user_id').on(table.userId),
    index('idx_agent_logs_command').on(table.command),
    index('idx_agent_logs_status').on(table.status),
    index('idx_agent_logs_started_at').on(table.startedAt),
  ]
);

// ------------------------------------------------------------
// RELATIONS
// ------------------------------------------------------------

export const projectsRelations = relations(projects, ({ many }) => ({
  chatMessages: many(chatMessages),
  chatSessions: many(chatSessions),
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

// ------------------------------------------------------------
// ZOD SCHEMAS
// ------------------------------------------------------------

export const agentLogInsertSchema = createInsertSchema(agentLogs, {
  // Override timestamp fields to coerce ISO strings to Date objects
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date(),
  createdAt: z.coerce.date().optional(),
});

// ------------------------------------------------------------
// TYPES
// ------------------------------------------------------------

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
export type BuildJob = typeof buildJobs.$inferSelect;
export type NewBuildJob = typeof buildJobs.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type NewAgentLog = typeof agentLogs.$inferInsert;
