CREATE TYPE "public"."chat_session_mode" AS ENUM('autonomous', 'human_assisted');--> statement-breakpoint
CREATE TYPE "public"."deploy_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."environment_job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('chat', 'requirements');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('admin_message', 'project_update', 'system');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('requirements', 'requirements_ready', 'environments_ready', 'waiting_for_payment', 'paid', 'in_development', 'active');--> statement-breakpoint
CREATE TYPE "public"."vamos_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "deploy_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "deploy_job_status" DEFAULT 'pending' NOT NULL,
	"current_step" varchar(100),
	"deployed_services" text,
	"error" text,
	"logs" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "diffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chat_message_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"content" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"applied_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "environment_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "environment_job_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"variable_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "github_sync_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"trigger_type" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'running',
	"changes" jsonb,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"logs" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link_url" text,
	"link_label" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_update_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"product_update_id" uuid NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_update_reads_unique" UNIQUE("clerk_user_id","product_update_id")
);
--> statement-breakpoint
CREATE TABLE "product_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"image_url" text,
	"link_url" text,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text,
	"action" varchar(50) NOT NULL,
	"previous_value" text,
	"new_value" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_commits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"commit_sha" text NOT NULL,
	"commit_message" text NOT NULL,
	"commit_url" text,
	"files_changed" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_environment_variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"is_secret" boolean DEFAULT false,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "project_env_vars_unique_key" UNIQUE("project_id","key")
);
--> statement-breakpoint
CREATE TABLE "project_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"integration_type" text NOT NULL,
	"integration_name" text NOT NULL,
	"config" text DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "project_integrations_unique_key" UNIQUE("project_id","integration_type","integration_name")
);
--> statement-breakpoint
CREATE TABLE "user_notification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"project_updates" boolean DEFAULT true NOT NULL,
	"product_updates" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_notification_settings_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "vamos_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "vamos_job_status" DEFAULT 'pending' NOT NULL,
	"phase" varchar(50),
	"total_phases" integer DEFAULT 6,
	"completed_phases" integer DEFAULT 0,
	"error" text,
	"logs" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "message_type" "message_type" DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "admin_user_id" text;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "mode" "chat_session_mode" DEFAULT 'autonomous' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status" "project_status" DEFAULT 'requirements' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "requirements_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "requirements_completed_by" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "stripe_invoice_url" text;--> statement-breakpoint
ALTER TABLE "deploy_jobs" ADD CONSTRAINT "deploy_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diffs" ADD CONSTRAINT "diffs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diffs" ADD CONSTRAINT "diffs_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_jobs" ADD CONSTRAINT "environment_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_sync_sessions" ADD CONSTRAINT "github_sync_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_update_reads" ADD CONSTRAINT "product_update_reads_product_update_id_product_updates_id_fk" FOREIGN KEY ("product_update_id") REFERENCES "public"."product_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_audit_logs" ADD CONSTRAINT "project_audit_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_commits" ADD CONSTRAINT "project_commits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_environment_variables" ADD CONSTRAINT "project_environment_variables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_integrations" ADD CONSTRAINT "project_integrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vamos_jobs" ADD CONSTRAINT "vamos_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deploy_jobs_project" ON "deploy_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_deploy_jobs_status" ON "deploy_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_environment_jobs_project" ON "environment_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_environment_jobs_status" ON "environment_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_is_read" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "idx_notifications_created_at" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_product_update_reads_user" ON "product_update_reads" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "idx_product_updates_published_at" ON "product_updates" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_project_audit_logs_project" ON "project_audit_logs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_audit_logs_action" ON "project_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_vamos_jobs_project" ON "vamos_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_vamos_jobs_status" ON "vamos_jobs" USING btree ("status");