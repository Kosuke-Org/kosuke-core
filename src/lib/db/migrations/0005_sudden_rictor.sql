CREATE TYPE "public"."build_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done', 'error');--> statement-breakpoint
CREATE TABLE "build_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_session_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "build_status" DEFAULT 'pending' NOT NULL,
	"total_cost" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"bull_job_id" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"build_job_id" uuid NOT NULL,
	"task_id" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"type" varchar(50),
	"category" varchar(50),
	"estimated_effort" integer DEFAULT 1 NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_remote_id_unique";--> statement-breakpoint
ALTER TABLE "build_jobs" ADD CONSTRAINT "build_jobs_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_jobs" ADD CONSTRAINT "build_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_build_job_id_build_jobs_id_fk" FOREIGN KEY ("build_job_id") REFERENCES "public"."build_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_build_jobs_session" ON "build_jobs" USING btree ("chat_session_id");--> statement-breakpoint
CREATE INDEX "idx_build_jobs_status" ON "build_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tasks_build_job" ON "tasks" USING btree ("build_job_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_status" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tasks_task_id" ON "tasks" USING btree ("task_id");--> statement-breakpoint
ALTER TABLE "chat_sessions" DROP COLUMN "remote_id";