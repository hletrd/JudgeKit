CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assignment_problems` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`points` integer DEFAULT 100,
	`sort_order` integer DEFAULT 0,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ap_assignment_idx` ON `assignment_problems` (`assignment_id`);--> statement-breakpoint
CREATE INDEX `ap_problem_idx` ON `assignment_problems` (`problem_id`);--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`starts_at` integer,
	`deadline` integer,
	`late_deadline` integer,
	`late_penalty` real DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`actor_role` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`resource_label` text,
	`summary` text NOT NULL,
	`details` text,
	`ip_address` text,
	`user_agent` text,
	`request_method` text,
	`request_path` text,
	`created_at` integer,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_events_action_idx` ON `audit_events` (`action`);--> statement-breakpoint
CREATE INDEX `audit_events_resource_type_idx` ON `audit_events` (`resource_type`);--> statement-breakpoint
CREATE INDEX `audit_events_created_at_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`group_id` text NOT NULL,
	`enrolled_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrollments_user_group_idx` ON `enrollments` (`user_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `enrollments_user_idx` ON `enrollments` (`user_id`);--> statement-breakpoint
CREATE INDEX `enrollments_group_idx` ON `enrollments` (`group_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`instructor_id` text,
	`is_archived` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`instructor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `language_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`display_name` text NOT NULL,
	`standard` text,
	`extension` text NOT NULL,
	`docker_image` text NOT NULL,
	`compiler` text,
	`compile_command` text,
	`run_command` text NOT NULL,
	`is_enabled` integer DEFAULT true,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `language_configs_language_unique` ON `language_configs` (`language`);--> statement-breakpoint
CREATE TABLE `login_events` (
	`id` text PRIMARY KEY NOT NULL,
	`outcome` text NOT NULL,
	`attempted_identifier` text,
	`user_id` text,
	`ip_address` text,
	`user_agent` text,
	`request_method` text,
	`request_path` text,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `login_events_outcome_idx` ON `login_events` (`outcome`);--> statement-breakpoint
CREATE INDEX `login_events_user_idx` ON `login_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `login_events_created_at_idx` ON `login_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `problem_group_access` (
	`id` text PRIMARY KEY NOT NULL,
	`problem_id` text NOT NULL,
	`group_id` text NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pga_problem_idx` ON `problem_group_access` (`problem_id`);--> statement-breakpoint
CREATE INDEX `pga_group_idx` ON `problem_group_access` (`group_id`);--> statement-breakpoint
CREATE TABLE `problems` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`time_limit_ms` integer DEFAULT 2000,
	`memory_limit_mb` integer DEFAULT 256,
	`visibility` text DEFAULT 'private',
	`author_id` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_started_at` integer NOT NULL,
	`blocked_until` integer,
	`consecutive_blocks` integer DEFAULT 0,
	`last_attempt` integer NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limits_key_idx` ON `rate_limits` (`key`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `submission_results` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`test_case_id` text NOT NULL,
	`status` text NOT NULL,
	`actual_output` text,
	`execution_time_ms` integer,
	`memory_used_kb` integer,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`test_case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sr_submission_idx` ON `submission_results` (`submission_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`assignment_id` text,
	`language` text NOT NULL,
	`source_code` text NOT NULL,
	`status` text DEFAULT 'pending',
	`judge_claim_token` text,
	`judge_claimed_at` integer,
	`compile_output` text,
	`execution_time_ms` integer,
	`memory_used_kb` integer,
	`score` real,
	`judged_at` integer,
	`submitted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `submissions_user_problem_idx` ON `submissions` (`user_id`,`problem_id`);--> statement-breakpoint
CREATE INDEX `submissions_status_idx` ON `submissions` (`status`);--> statement-breakpoint
CREATE INDEX `submissions_user_idx` ON `submissions` (`user_id`);--> statement-breakpoint
CREATE INDEX `submissions_problem_idx` ON `submissions` (`problem_id`);--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`site_title` text,
	`site_description` text,
	`time_zone` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `test_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`problem_id` text NOT NULL,
	`input` text NOT NULL,
	`expected_output` text NOT NULL,
	`is_visible` integer DEFAULT false,
	`sort_order` integer DEFAULT 0,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `test_cases_problem_idx` ON `test_cases` (`problem_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`name` text NOT NULL,
	`class_name` text,
	`password_hash` text,
	`role` text DEFAULT 'student' NOT NULL,
	`is_active` integer DEFAULT true,
	`must_change_password` integer DEFAULT false,
	`token_invalidated_at` integer,
	`email_verified` integer,
	`image` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);