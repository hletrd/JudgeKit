ALTER TABLE `system_settings` ADD COLUMN `login_rate_limit_max_attempts` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `login_rate_limit_window_ms` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `login_rate_limit_block_ms` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `api_rate_limit_max` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `api_rate_limit_window_ms` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `submission_rate_limit_max_per_minute` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `submission_max_pending` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `submission_global_queue_limit` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `default_time_limit_ms` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `default_memory_limit_mb` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `max_source_code_size_bytes` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `stale_claim_timeout_ms` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `session_max_age_seconds` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `min_password_length` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `default_page_size` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `max_sse_connections_per_user` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `sse_poll_interval_ms` integer;--> statement-breakpoint
ALTER TABLE `system_settings` ADD COLUMN `sse_timeout_ms` integer;