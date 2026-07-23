-- Per-contest AI override for participants. Idempotent (repo convention:
-- production deploys via `drizzle-kit push`, so the column/constraint may
-- already exist; from-scratch migrate() — integration tests and DR rebuild —
-- must also replay cleanly). The check constraint mirrors
-- assignments_exam_mode_valid: the AI gate branches on this value, so a corrupt
-- value must not silently defeat a contest's allow/forbid.
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "ai_assistant_policy" text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assignments_ai_assistant_policy_valid'
  ) THEN
    ALTER TABLE "assignments" ADD CONSTRAINT "assignments_ai_assistant_policy_valid" CHECK (ai_assistant_policy IN ('inherit', 'allow', 'forbid'));
  END IF;
END $$;
