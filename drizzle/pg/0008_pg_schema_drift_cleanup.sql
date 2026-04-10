CREATE TABLE IF NOT EXISTS "code_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"assignment_id" text,
	"language" text NOT NULL,
	"source_code" text NOT NULL,
	"char_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recruiting_invitations" DROP CONSTRAINT IF EXISTS "recruiting_invitations_created_by_users_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "tags_name_idx";
--> statement-breakpoint
ALTER TABLE "recruiting_invitations" ALTER COLUMN "created_by" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "system_settings" ALTER COLUMN "id" SET DEFAULT 'global';
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "hide_scores_from_candidates" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "problem_id" text;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "tags"
		GROUP BY "name"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot add tags_name_unique: duplicate tag names exist'
			USING HINT = 'Deduplicate rows in the tags table before applying this migration.';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'code_snapshots_user_id_users_id_fk'
	) THEN
		ALTER TABLE "code_snapshots"
			ADD CONSTRAINT "code_snapshots_user_id_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'code_snapshots_problem_id_problems_id_fk'
	) THEN
		ALTER TABLE "code_snapshots"
			ADD CONSTRAINT "code_snapshots_problem_id_problems_id_fk"
			FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'code_snapshots_assignment_id_assignments_id_fk'
	) THEN
		ALTER TABLE "code_snapshots"
			ADD CONSTRAINT "code_snapshots_assignment_id_assignments_id_fk"
			FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cs_user_problem_idx" ON "code_snapshots" USING btree ("user_id","problem_id","assignment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cs_created_at_idx" ON "code_snapshots" USING btree ("created_at");
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'files_problem_id_problems_id_fk'
	) THEN
		ALTER TABLE "files"
			ADD CONSTRAINT "files_problem_id_problems_id_fk"
			FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id")
			ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'recruiting_invitations_created_by_users_id_fk'
	) THEN
		ALTER TABLE "recruiting_invitations"
			ADD CONSTRAINT "recruiting_invitations_created_by_users_id_fk"
			FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
			ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "files_problem_id_idx" ON "files" USING btree ("problem_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_last_attempt_idx" ON "rate_limits" USING btree ("last_attempt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_leaderboard_idx" ON "submissions" USING btree ("assignment_id","user_id","submitted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_lower_username_idx" ON "users" USING btree (lower("username"));
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'tags_name_unique'
	) THEN
		ALTER TABLE "tags" ADD CONSTRAINT "tags_name_unique" UNIQUE("name");
	END IF;
END $$;
