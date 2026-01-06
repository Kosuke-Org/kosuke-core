CREATE TABLE "maintenance_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"sync_rules_enabled" boolean DEFAULT false NOT NULL,
	"analyze_enabled" boolean DEFAULT false NOT NULL,
	"security_check_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_settings_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "maintenance_settings" ADD CONSTRAINT "maintenance_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;