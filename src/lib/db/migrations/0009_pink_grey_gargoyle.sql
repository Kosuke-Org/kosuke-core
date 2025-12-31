CREATE TYPE "public"."submit_status" AS ENUM('pending', 'reviewing', 'committing', 'creating_pr', 'done', 'failed');--> statement-breakpoint
ALTER TABLE "build_jobs" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "build_jobs" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."build_status";--> statement-breakpoint
CREATE TYPE "public"."build_status" AS ENUM('pending', 'implementing', 'validating', 'ready', 'failed', 'cancelled');--> statement-breakpoint
ALTER TABLE "build_jobs" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."build_status";--> statement-breakpoint
ALTER TABLE "build_jobs" ALTER COLUMN "status" SET DATA TYPE "public"."build_status" USING "status"::"public"."build_status";--> statement-breakpoint
ALTER TABLE "build_jobs" ADD COLUMN "tickets_path" varchar(255);--> statement-breakpoint
ALTER TABLE "build_jobs" ADD COLUMN "submit_status" "submit_status";