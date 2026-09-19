-- Scope editor autosaves to the contest they were written in.
--
-- source_drafts was keyed (user, problem, language), so code autosaved on the
-- practice page (or in another contest reusing the problem) was restored into
-- a contest editor. assignment_id partitions the drafts: NULL is the shared
-- practice draft, a value is a draft written inside that contest. Existing
-- rows keep NULL, i.e. they stay practice drafts and are no longer visible
-- from any contest.
--
-- Idempotent (matches the repo convention): production builds the schema via
-- `drizzle-kit push`, so these objects may already exist; from-scratch
-- migrate() (integration tests / DR rebuild) must also replay cleanly.
DROP INDEX IF EXISTS "source_drafts_user_problem_lang_unique";--> statement-breakpoint
ALTER TABLE "source_drafts" ADD COLUMN IF NOT EXISTS "assignment_id" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'source_drafts_assignment_id_assignments_id_fk'
  ) THEN
    ALTER TABLE "source_drafts" ADD CONSTRAINT "source_drafts_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
-- Two partial indexes instead of one 4-column index: NULLs are distinct in a
-- plain unique index, which would let the practice scope grow duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS "source_drafts_practice_unique" ON "source_drafts" USING btree ("user_id","problem_id","language") WHERE assignment_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_drafts_contest_unique" ON "source_drafts" USING btree ("user_id","problem_id","language","assignment_id") WHERE assignment_id is not null;
