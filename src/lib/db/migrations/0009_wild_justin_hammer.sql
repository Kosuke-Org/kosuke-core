CREATE TYPE "public"."submit_status" AS ENUM('pending', 'reviewing', 'committing', 'creating_pr', 'done', 'failed');--> statement-breakpoint
ALTER TYPE "public"."build_status" ADD VALUE 'validating' BEFORE 'completed';--> statement-breakpoint
ALTER TABLE "build_jobs" ADD COLUMN "tickets_path" varchar(255);--> statement-breakpoint
ALTER TABLE "build_jobs" ADD COLUMN "submit_status" "submit_status";