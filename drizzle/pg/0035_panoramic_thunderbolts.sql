CREATE TABLE "smtp_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_secure" boolean DEFAULT false NOT NULL,
	"smtp_user" text,
	"smtp_pass" text,
	"smtp_from" text,
	"email_verification_required" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ui_content_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"home_page_content" jsonb,
	"footer_content" jsonb,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
INSERT INTO "smtp_settings" ("id", "smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_pass", "smtp_from", "email_verification_required", "updated_at")
SELECT "id", "smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_pass", "smtp_from", "email_verification_required", "updated_at"
FROM "system_settings"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "ui_content_settings" ("id", "home_page_content", "footer_content", "updated_at")
SELECT "id", "home_page_content", "footer_content", "updated_at"
FROM "system_settings"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "system_settings" DROP COLUMN "home_page_content";--> statement-breakpoint
ALTER TABLE "system_settings" DROP COLUMN "footer_content";--> statement-breakpoint
ALTER TABLE "system_settings" DROP COLUMN "smtp_host";--> statement-breakpoint
ALTER TABLE "system_settings" DROP COLUMN "smtp_port";--> statement-breakpoint
ALTER TABLE "system_settings" DROP COLUMN "smtp_secure";--> statement-breakpoint
ALTER TABLE "system_settings" DROP COLUMN "smtp_user";--> statement-breakpoint
ALTER TABLE "system_settings" DROP COLUMN "smtp_pass";--> statement-breakpoint
ALTER TABLE "system_settings" DROP COLUMN "smtp_from";--> statement-breakpoint
ALTER TABLE "system_settings" DROP COLUMN "email_verification_required";