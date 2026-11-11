CREATE TABLE `xp_ledger` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`student_id` bigint NOT NULL,
	`event` varchar(32) NOT NULL,
	`source_id` bigint NOT NULL,
	`points` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `xp_ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `xp_ledger_student_event_source_unique` UNIQUE(`student_id`,`event`,`source_id`)
);
--> statement-breakpoint
ALTER TABLE `xp_ledger` ADD CONSTRAINT `xp_ledger_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `xp_ledger_student_idx` ON `xp_ledger` (`student_id`);