CREATE TYPE "public"."maintenance_job_run_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."maintenance_job_type" AS ENUM('sync_rules', 'code_analysis', 'security_check');--> statement-breakpoint
CREATE TABLE "maintenance_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maintenance_job_id" uuid NOT NULL,
	"status" "maintenance_job_run_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"summary" text,
	"pull_request_url" text,
	"pull_request_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"job_type" "maintenance_job_type" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_jobs_project_job_type_unique" UNIQUE("project_id","job_type")
);
--> statement-breakpoint
ALTER TABLE "maintenance_job_runs" ADD CONSTRAINT "maintenance_job_runs_maintenance_job_id_maintenance_jobs_id_fk" FOREIGN KEY ("maintenance_job_id") REFERENCES "public"."maintenance_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_maintenance_job_runs_job_started" ON "maintenance_job_runs" USING btree ("maintenance_job_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_maintenance_job_runs_status" ON "maintenance_job_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_maintenance_jobs_project" ON "maintenance_jobs" USING btree ("project_id");