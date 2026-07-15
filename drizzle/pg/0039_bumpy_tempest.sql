ALTER TABLE "users" ALTER COLUMN "share_accepted_solutions" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "shared_with_community" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Privacy backfill: accepted-solution sharing shipped as opt-out (default ON),
-- so most accounts were sharing without an explicit choice. Switch every
-- existing account to not-sharing; users who want to share must now opt in,
-- and (via submissions.shared_with_community, backfilled false by the ADD
-- COLUMN default above) opting in only exposes submissions made afterwards.
-- NOTE: production deploys sync schema via `drizzle-kit push`, which does NOT
-- execute this UPDATE — run it against production explicitly when deploying.
UPDATE "users" SET "share_accepted_solutions" = false WHERE "share_accepted_solutions" = true;