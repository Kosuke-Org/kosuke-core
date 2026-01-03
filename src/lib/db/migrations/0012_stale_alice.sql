ALTER TYPE "public"."project_status" ADD VALUE 'waiting_for_payment' BEFORE 'in_development';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'paid' BEFORE 'in_development';--> statement-breakpoint
ALTER TABLE "chat_sessions" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "stripe_invoice_url" text;