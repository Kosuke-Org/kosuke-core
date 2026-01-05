CREATE TYPE "public"."chat_session_mode" AS ENUM('autonomous', 'human_assisted');--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "admin_user_id" text;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "mode" "chat_session_mode" DEFAULT 'autonomous' NOT NULL;