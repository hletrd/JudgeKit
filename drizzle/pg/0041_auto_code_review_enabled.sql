-- Master on/off toggle for the automatic per-submission AI code review that
-- fires when a submission is accepted. Default TRUE preserves the pre-toggle
-- behavior; only the AUTO trigger reads this flag (admin manual/backfill run
-- regardless). Idempotent so it is safe to re-apply on drift-caught deploys.
ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "auto_code_review_enabled" boolean NOT NULL DEFAULT true;
