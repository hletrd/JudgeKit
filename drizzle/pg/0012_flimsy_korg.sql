-- NOTE: drizzle-kit regenerated this migration from schema.ts and re-emitted
-- objects that earlier hand-written migrations already create:
--   * discussion_posts / discussion_threads (+ their FKs and indexes) -> 0010
--   * system_settings.public_signup_enabled / signup_hcaptcha_enabled -> 0011
-- Applied via `drizzle-kit push` in production this never mattered, but a
-- from-scratch `migrate()` (integration tests, DB rebuild / disaster recovery)
-- failed on the first duplicate CREATE. Every statement below is made
-- idempotent so the journal is replayable from an empty database while
-- producing the exact same end-state.
CREATE TABLE IF NOT EXISTS "discussion_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"author_id" text,
	"content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discussion_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_type" text NOT NULL,
	"problem_id" text,
	"author_id" text,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"locked_at" timestamp with time zone,
	"pinned_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "assignments_access_code_idx";--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "completion_status" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "public_signup_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "signup_hcaptcha_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "home_page_content" jsonb;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "footer_content" jsonb;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discussion_posts_thread_id_discussion_threads_id_fk'
  ) THEN
    ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_thread_id_discussion_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."discussion_threads"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discussion_posts_author_id_users_id_fk'
  ) THEN
    ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discussion_threads_problem_id_problems_id_fk'
  ) THEN
    ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discussion_threads_author_id_users_id_fk'
  ) THEN
    ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dp_thread_idx" ON "discussion_posts" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dp_author_idx" ON "discussion_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dp_created_at_idx" ON "discussion_posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dt_scope_idx" ON "discussion_threads" USING btree ("scope_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dt_problem_idx" ON "discussion_threads" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dt_updated_at_idx" ON "discussion_threads" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assignments_access_code_unique" ON "assignments" USING btree ("access_code");
