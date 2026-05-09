-- Add index on expires_at to support the expiry check in contest access queries
CREATE INDEX IF NOT EXISTS "cat_expires_at_idx" ON "contest_access_tokens" ("expires_at");

-- Set expires_at for existing tokens based on their assignment deadline.
-- Tokens with a valid assignment get the assignment's deadline.
UPDATE "contest_access_tokens" cat
SET "expires_at" = a.deadline
FROM "assignments" a
WHERE cat."assignment_id" = a.id
  AND cat."expires_at" IS NULL;

-- For tokens whose assignment no longer exists (orphaned), set expires_at
-- to a fixed past date so they are treated as expired rather than valid forever.
UPDATE "contest_access_tokens"
SET "expires_at" = '1970-01-01 00:00:00+00'
WHERE "expires_at" IS NULL;
