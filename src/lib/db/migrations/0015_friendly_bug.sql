CREATE TYPE "public"."environment_job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
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
ALTER TABLE "environment_jobs" ADD CONSTRAINT "environment_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_environment_jobs_project" ON "environment_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_environment_jobs_status" ON "environment_jobs" USING btree ("status");