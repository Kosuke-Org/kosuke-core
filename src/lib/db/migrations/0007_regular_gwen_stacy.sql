CREATE TYPE "public"."agent_log_command" AS ENUM('requirements', 'plan', 'build');--> statement-breakpoint
CREATE TYPE "public"."agent_log_status" AS ENUM('success', 'error', 'cancelled');--> statement-breakpoint
CREATE TABLE "agent_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"org_id" text,
	"user_id" text,
	"command" "agent_log_command" NOT NULL,
	"command_args" jsonb,
	"status" "agent_log_status" NOT NULL,
	"error_message" text,
	"tokens_input" integer NOT NULL,
	"tokens_output" integer NOT NULL,
	"tokens_cache_creation" integer DEFAULT 0,
	"tokens_cache_read" integer DEFAULT 0,
	"cost" varchar(20) NOT NULL,
	"execution_time_ms" integer NOT NULL,
	"inference_time_ms" integer,
	"fixes_applied" integer,
	"tests_run" integer,
	"tests_passed" integer,
	"tests_failed" integer,
	"iterations" integer,
	"files_modified" jsonb,
	"agent_version" varchar(50),
	"conversation_messages" jsonb,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "diffs" CASCADE;--> statement-breakpoint
DROP TABLE "github_sync_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "project_commits" CASCADE;--> statement-breakpoint
DROP TABLE "project_environment_variables" CASCADE;--> statement-breakpoint
DROP TABLE "project_integrations" CASCADE;--> statement-breakpoint
ALTER TABLE "agent_logs" ADD CONSTRAINT "agent_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_logs_project_id" ON "agent_logs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_agent_logs_org_id" ON "agent_logs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_agent_logs_user_id" ON "agent_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_agent_logs_command" ON "agent_logs" USING btree ("command");--> statement-breakpoint
CREATE INDEX "idx_agent_logs_status" ON "agent_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_agent_logs_started_at" ON "agent_logs" USING btree ("started_at");