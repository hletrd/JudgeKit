DROP INDEX "ri_token_idx";--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_idx" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "chat_messages_problem_id_idx" ON "chat_messages" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "submissions_retention_idx" ON "submissions" USING btree ("submitted_at","status");--> statement-breakpoint
ALTER TABLE "recruiting_invitations" DROP COLUMN "token";--> statement-breakpoint
-- Guarded: assignments_late_penalty_nonneg is already added by 0018; this
-- unguarded re-add broke from-scratch migrate(). Made idempotent (same as the
-- judge_workers check below) so the journal is replayable from an empty DB.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assignments_late_penalty_nonneg'
  ) THEN
    ALTER TABLE "assignments" ADD CONSTRAINT "assignments_late_penalty_nonneg" CHECK ("assignments"."late_penalty" >= 0);
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'judge_workers_active_tasks_nonneg'
  ) THEN
    ALTER TABLE "judge_workers" ADD CONSTRAINT "judge_workers_active_tasks_nonneg" CHECK (active_tasks >= 0);
  END IF;
END $$;