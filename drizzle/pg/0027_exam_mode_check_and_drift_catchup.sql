-- Idempotent (repo convention: production deploys via `drizzle-kit push`, so
-- these objects may already exist; from-scratch migrate() — integration tests
-- and DR rebuild — must also replay cleanly).
--
-- Drift catch-up: the hand-written 0027_upload_max_zip_setting.sql and
-- 0028_platform_mode_restriction_overrides.sql files were never added to
-- meta/_journal.json, so migrate() never ran them and a from-scratch rebuild
-- was missing these three system_settings columns. This journaled migration
-- supersedes both files (kept on disk for history; they are not in the journal).
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "allow_ai_assistant_in_restricted_modes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "allow_standalone_compiler_in_restricted_modes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "upload_max_zip_decompressed_size_bytes" integer;--> statement-breakpoint
-- Integrity guard for exam grading: normalize any corrupt value (observed
-- "0.0" in prod once) BEFORE adding the constraint so it can always be applied.
UPDATE "assignments" SET "exam_mode" = 'none' WHERE "exam_mode" NOT IN ('none', 'scheduled', 'windowed');--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assignments_exam_mode_valid'
  ) THEN
    ALTER TABLE "assignments" ADD CONSTRAINT "assignments_exam_mode_valid" CHECK (exam_mode IN ('none', 'scheduled', 'windowed'));
  END IF;
END $$;
