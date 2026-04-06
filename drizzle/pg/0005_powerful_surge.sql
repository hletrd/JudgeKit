CREATE TABLE "group_instructors" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "encrypted_key" text;--> statement-breakpoint
ALTER TABLE "judge_workers" ADD COLUMN "cpu_model" text;--> statement-breakpoint
ALTER TABLE "judge_workers" ADD COLUMN "architecture" text;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "problem_type" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_comments" ADD COLUMN "line_number" integer;--> statement-breakpoint
ALTER TABLE "group_instructors" ADD CONSTRAINT "group_instructors_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_instructors" ADD CONSTRAINT "group_instructors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_instructors_group_user_idx" ON "group_instructors" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "group_instructors_user_idx" ON "group_instructors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "group_instructors_group_idx" ON "group_instructors" USING btree ("group_id");