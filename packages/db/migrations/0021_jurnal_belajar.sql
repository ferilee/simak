CREATE TABLE `journal_entries` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`student_id` bigint NOT NULL,
	`entry_date` date NOT NULL,
	`body` text NOT NULL,
	`prompt_key` varchar(64),
	`mood` varchar(32),
	`linked_module_id` bigint,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `journal_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_linked_module_id_modules_id_fk` FOREIGN KEY (`linked_module_id`) REFERENCES `modules`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `journal_entries_student_date_idx` ON `journal_entries` (`student_id`,`entry_date`);