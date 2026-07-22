-- Enforce at most ONE AI-authored (author_id IS NULL) comment per submission.
--
-- The AI code-review generator (src/lib/judge/auto-review.ts) and the admin
-- backfill were check-then-insert with NO database constraint, so a concurrent
-- or looping backfill could select and generate the same submission twice and
-- insert TWO student-visible AI comments. This partial unique index is the
-- race-proof backstop; the generator's insert now uses ON CONFLICT DO NOTHING
-- on it so the losing generation reports "skipped" instead of erroring.
--
-- Step 1: remove any pre-existing duplicate AI comments (from the old
-- check-then-insert path) BEFORE creating the index — otherwise the CREATE
-- UNIQUE INDEX would fail. Keep the earliest row per submission (smallest
-- created_at, tie-break by id); delete the rest. Idempotent: a table with no
-- duplicates deletes nothing.
DELETE FROM "submission_comments" AS "dup"
USING "submission_comments" AS "keep"
WHERE "dup"."author_id" IS NULL
  AND "keep"."author_id" IS NULL
  AND "dup"."submission_id" = "keep"."submission_id"
  AND ("dup"."created_at", "dup"."id") > ("keep"."created_at", "keep"."id");
--> statement-breakpoint
-- Step 2: create the partial unique index. IF NOT EXISTS keeps it safe to
-- re-apply on drift-caught deploys (this repo deploys via drizzle-kit push).
CREATE UNIQUE INDEX IF NOT EXISTS "submission_comments_ai_unique" ON "submission_comments" USING btree ("submission_id") WHERE author_id is null;
