-- AI-use signature flags: one row per submission whose source contains a
-- {{signature: token}} token of its problem (or of another problem in the same
-- contest). Manager-only data, kept out of the submissions table so whole-row
-- student reads can never carry it.
--
-- Idempotent (matches the repo convention): production builds the schema via
-- `drizzle-kit push`, so these objects may already exist; from-scratch
-- migrate() (integration tests / DR rebuild) must also replay cleanly.
CREATE TABLE IF NOT EXISTS "submission_signature_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"matches" jsonb NOT NULL,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'submission_signature_flags_submission_id_submissions_id_fk'
  ) THEN
    ALTER TABLE "submission_signature_flags" ADD CONSTRAINT "submission_signature_flags_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submission_signature_flags_submission_unique" ON "submission_signature_flags" USING btree ("submission_id");
