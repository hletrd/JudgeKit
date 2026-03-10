CREATE TABLE `score_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`user_id` text NOT NULL,
	`override_score` integer NOT NULL,
	`reason` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `score_overrides_assignment_problem_user_idx` ON `score_overrides` (`assignment_id`,`problem_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `score_overrides_assignment_idx` ON `score_overrides` (`assignment_id`);--> statement-breakpoint
CREATE TABLE `submission_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`author_id` text,
	`content` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sc_submission_idx` ON `submission_comments` (`submission_id`);--> statement-breakpoint
CREATE INDEX `sc_author_idx` ON `submission_comments` (`author_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ap_assignment_problem_idx` ON `assignment_problems` (`assignment_id`,`problem_id`);--> statement-breakpoint
CREATE INDEX `assignments_group_idx` ON `assignments` (`group_id`);--> statement-breakpoint
CREATE INDEX `sr_test_case_idx` ON `submission_results` (`test_case_id`);--> statement-breakpoint
CREATE INDEX `submissions_assignment_idx` ON `submissions` (`assignment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);