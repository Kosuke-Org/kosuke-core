CREATE TYPE "public"."deploy_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
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
ALTER TABLE "deploy_jobs" ADD CONSTRAINT "deploy_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vamos_jobs" ADD CONSTRAINT "vamos_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deploy_jobs_project" ON "deploy_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_deploy_jobs_status" ON "deploy_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_vamos_jobs_project" ON "vamos_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_vamos_jobs_status" ON "vamos_jobs" USING btree ("status");