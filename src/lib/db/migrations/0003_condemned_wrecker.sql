CREATE TYPE "public"."build_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "build_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_session_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "build_status" DEFAULT 'pending' NOT NULL,
	"tickets" jsonb,
	"total_tickets" integer DEFAULT 0 NOT NULL,
	"completed_tickets" integer DEFAULT 0 NOT NULL,
	"failed_tickets" integer DEFAULT 0 NOT NULL,
	"current_ticket_id" varchar(100),
	"total_cost" real DEFAULT 0,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"bull_job_id" varchar(100)
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_session_id_unique";--> statement-breakpoint
ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_remote_id_unique";--> statement-breakpoint
ALTER TABLE "build_jobs" ADD CONSTRAINT "build_jobs_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_jobs" ADD CONSTRAINT "build_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_build_jobs_session" ON "build_jobs" USING btree ("chat_session_id");--> statement-breakpoint
CREATE INDEX "idx_build_jobs_status" ON "build_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_last_activity_at" ON "chat_sessions" USING btree ("last_activity_at");--> statement-breakpoint
ALTER TABLE "chat_sessions" DROP COLUMN "remote_id";--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_project_session_unique" UNIQUE("project_id","session_id");