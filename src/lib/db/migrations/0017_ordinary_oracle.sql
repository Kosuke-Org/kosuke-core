-- Create the message_type enum
CREATE TYPE "public"."message_type" AS ENUM('chat', 'requirements');--> statement-breakpoint

-- Add message_type column to chat_messages with default 'chat'
ALTER TABLE "chat_messages" ADD COLUMN "message_type" "message_type" DEFAULT 'chat' NOT NULL;--> statement-breakpoint

-- Migrate data from requirements_messages to chat_messages
-- Requirements messages go to the default (main) session for each project
INSERT INTO "chat_messages" (
  "id",
  "project_id",
  "chat_session_id",
  "user_id",
  "role",
  "content",
  "blocks",
  "message_type",
  "timestamp"
)
SELECT
  rm."id",
  rm."project_id",
  cs."id" as "chat_session_id",
  rm."user_id",
  rm."role",
  rm."content",
  rm."blocks",
  'requirements'::"message_type" as "message_type",
  rm."timestamp"
FROM "requirements_messages" rm
INNER JOIN "chat_sessions" cs
  ON cs."project_id" = rm."project_id"
  AND cs."is_default" = true;--> statement-breakpoint

-- Drop the requirements_messages table now that data is migrated
DROP TABLE "requirements_messages" CASCADE;
