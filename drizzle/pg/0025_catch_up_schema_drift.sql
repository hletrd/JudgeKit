-- Catch-up migration reconciling the journal with schema.pg.ts. Production was
-- built via `drizzle-kit push`, so several recent objects (recruiting columns,
-- email-verification / password-reset token tables, SMTP settings, etc.) exist
-- in schema.ts/prod but were never captured as migrations. drizzle-kit generated
-- this from the (stale) snapshot, so some objects here are ALSO created by
-- earlier journal migrations; every statement is therefore idempotent so a
-- from-scratch `migrate()` (integration tests / DR rebuild) replays cleanly and
-- only the genuinely-missing objects are created. End-state == schema.ts.
CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "recruiting_organization_name" text;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "recruiting_organization_logo_url" text;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "recruiting_contact_email" text;--> statement-breakpoint
ALTER TABLE "contest_access_tokens" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "language_configs" ADD COLUMN IF NOT EXISTS "time_limit_multiplier" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "smtp_host" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "smtp_port" integer;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "smtp_secure" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "smtp_user" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "smtp_pass" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "smtp_from" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "email_verification_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "community_upvote_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "community_downvote_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_verification_tokens_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_tokens_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evt_user_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evt_token_hash_idx" ON "email_verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evt_expires_at_idx" ON "email_verification_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prt_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prt_token_hash_idx" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prt_expires_at_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cat_expires_at_idx" ON "contest_access_tokens" USING btree ("expires_at");
