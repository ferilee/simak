CREATE TABLE `sessions` (
	`token_hash` varchar(64) NOT NULL,
	`user_id` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_token_hash` PRIMARY KEY(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);