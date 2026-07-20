ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "warm_pool" jsonb;
