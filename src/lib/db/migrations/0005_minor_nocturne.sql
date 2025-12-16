ALTER TABLE "chat_sessions" RENAME COLUMN "session_id" TO "branch_name";--> statement-breakpoint
ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_project_session_unique";--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_project_branch_unique" UNIQUE("project_id","branch_name");