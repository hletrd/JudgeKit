-- Admin escape hatches for platform-mode-derived restrictions. A restricted
-- platform mode (exam/contest/recruiting) forces the AI assistant off and (for
-- exam/recruiting) disables the standalone compiler. These flags let an admin
-- deliberately re-enable each one without leaving the mode. Safe default false
-- keeps the existing anti-cheat behaviour.
-- Idempotent (production uses `drizzle-kit push`; from-scratch migrate() must
-- replay cleanly): columns may already exist.
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "allow_ai_assistant_in_restricted_modes" boolean NOT NULL DEFAULT false;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "allow_standalone_compiler_in_restricted_modes" boolean NOT NULL DEFAULT false;
