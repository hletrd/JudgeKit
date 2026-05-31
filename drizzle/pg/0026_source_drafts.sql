-- Idempotent (matches the repo convention): production builds the schema via
-- `drizzle-kit push`, so this table may already exist; from-scratch migrate()
-- (integration tests / DR rebuild) must also replay cleanly.
CREATE TABLE IF NOT EXISTS "source_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"language" text NOT NULL,
	"source_code" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'source_drafts_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "source_drafts" ADD CONSTRAINT "source_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'source_drafts_problem_id_problems_id_fk'
  ) THEN
    ALTER TABLE "source_drafts" ADD CONSTRAINT "source_drafts_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_drafts_user_problem_lang_unique" ON "source_drafts" USING btree ("user_id","problem_id","language");
