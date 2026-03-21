CREATE TABLE `judge_workers` (
	`id` text PRIMARY KEY NOT NULL,
	`hostname` text NOT NULL,
	`concurrency` integer NOT NULL DEFAULT 1,
	`active_tasks` integer NOT NULL DEFAULT 0,
	`version` text,
	`labels` text DEFAULT '[]',
	`status` text NOT NULL DEFAULT 'online',
	`registered_at` integer NOT NULL,
	`last_heartbeat_at` integer NOT NULL,
	`deregistered_at` integer
);
--> statement-breakpoint
CREATE INDEX `judge_workers_status_idx` ON `judge_workers` (`status`);
--> statement-breakpoint
CREATE INDEX `judge_workers_last_heartbeat_idx` ON `judge_workers` (`last_heartbeat_at`);
--> statement-breakpoint
ALTER TABLE `submissions` ADD `judge_worker_id` text;
--> statement-breakpoint
CREATE INDEX `submissions_judge_worker_idx` ON `submissions` (`judge_worker_id`);
