CREATE TYPE "public"."submit_status" AS ENUM('pending', 'reviewing', 'committing', 'creating_pr', 'done', 'failed');--> statement-breakpoint
ALTER TYPE "public"."build_status" ADD VALUE 'validating' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "organization_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"anthropic_api_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_api_keys_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
ALTER TABLE "build_jobs" ADD COLUMN "tickets_path" varchar(255);--> statement-breakpoint
ALTER TABLE "build_jobs" ADD COLUMN "submit_status" "submit_status";