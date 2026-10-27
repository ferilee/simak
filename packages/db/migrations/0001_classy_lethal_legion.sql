CREATE TABLE `worksheet_answers` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`attempt_id` bigint NOT NULL,
	`worksheet_item_id` bigint NOT NULL,
	`answer_text` text,
	`attachment_key` varchar(512),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worksheet_answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `worksheet_answers_pair_unique` UNIQUE(`attempt_id`,`worksheet_item_id`)
);
--> statement-breakpoint
CREATE TABLE `worksheet_attempts` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`worksheet_id` bigint NOT NULL,
	`student_id` bigint NOT NULL,
	`status` enum('draf','terkumpul') NOT NULL DEFAULT 'draf',
	`submitted_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worksheet_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `worksheet_attempts_student_unique` UNIQUE(`worksheet_id`,`student_id`)
);
--> statement-breakpoint
ALTER TABLE `worksheet_answers` ADD CONSTRAINT `worksheet_answers_attempt_id_worksheet_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `worksheet_attempts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worksheet_answers` ADD CONSTRAINT `worksheet_answers_worksheet_item_id_worksheet_items_id_fk` FOREIGN KEY (`worksheet_item_id`) REFERENCES `worksheet_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worksheet_attempts` ADD CONSTRAINT `worksheet_attempts_worksheet_id_worksheets_id_fk` FOREIGN KEY (`worksheet_id`) REFERENCES `worksheets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worksheet_attempts` ADD CONSTRAINT `worksheet_attempts_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `worksheet_attempts_student_idx` ON `worksheet_attempts` (`student_id`);