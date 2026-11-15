CREATE TABLE `ruas_handoff_tokens` (
	`token_hash` varchar(64) NOT NULL,
	`user_id` bigint NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ruas_handoff_tokens_token_hash` PRIMARY KEY(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `ruas_handoff_tokens` ADD CONSTRAINT `ruas_handoff_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ruas_handoff_tokens_expires_idx` ON `ruas_handoff_tokens` (`expires_at`);