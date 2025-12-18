ALTER TYPE "public"."build_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "build_jobs" ADD COLUMN "start_commit" varchar(40);