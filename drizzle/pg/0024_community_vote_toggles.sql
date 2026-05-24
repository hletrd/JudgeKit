-- Add operator toggles for community thread / post voting. Defaults are
-- TRUE so existing deployments preserve the historical "both directions
-- enabled" behavior; an admin can dial down to upvote-only (or fully off)
-- without disabling the community board.
ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "community_upvote_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "community_downvote_enabled" boolean NOT NULL DEFAULT true;
