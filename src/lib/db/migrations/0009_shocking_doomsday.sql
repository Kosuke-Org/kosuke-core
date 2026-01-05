CREATE TABLE "user_github_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"github_access_token" text NOT NULL,
	"github_refresh_token" text,
	"github_token_expires_at" timestamp,
	"github_user_id" integer NOT NULL,
	"github_username" varchar(255) NOT NULL,
	"github_avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_github_connections_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "github_installation_id" integer;