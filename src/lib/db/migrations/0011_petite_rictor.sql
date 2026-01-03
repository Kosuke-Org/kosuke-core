CREATE TYPE "public"."project_status" AS ENUM('requirements', 'requirements_ready', 'in_development', 'active');--> statement-breakpoint
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
CREATE TABLE "requirements_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text,
	"role" varchar(20) NOT NULL,
	"content" text,
	"blocks" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status" "project_status" DEFAULT 'requirements' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "requirements_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "requirements_completed_by" text;--> statement-breakpoint
ALTER TABLE "project_audit_logs" ADD CONSTRAINT "project_audit_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements_messages" ADD CONSTRAINT "requirements_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_audit_logs_project" ON "project_audit_logs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_audit_logs_action" ON "project_audit_logs" USING btree ("action");