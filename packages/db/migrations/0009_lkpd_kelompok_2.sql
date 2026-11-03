CREATE TABLE `group_contribution_ratings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`attempt_id` bigint NOT NULL,
	`rater_student_id` bigint NOT NULL,
	`ratee_student_id` bigint NOT NULL,
	`score` tinyint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `group_contribution_ratings_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_contribution_ratings_trio_unique` UNIQUE(`attempt_id`,`rater_student_id`,`ratee_student_id`)
);
--> statement-breakpoint
CREATE TABLE `worksheet_attempt_member_scores` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`attempt_id` bigint NOT NULL,
	`student_id` bigint NOT NULL,
	`score` decimal(8,2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worksheet_attempt_member_scores_id` PRIMARY KEY(`id`),
	CONSTRAINT `worksheet_attempt_member_scores_pair_unique` UNIQUE(`attempt_id`,`student_id`)
);
--> statement-breakpoint
ALTER TABLE `group_contribution_ratings` ADD CONSTRAINT `group_contribution_ratings_attempt_id_worksheet_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `worksheet_attempts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_contribution_ratings` ADD CONSTRAINT `group_contribution_ratings_rater_student_id_users_id_fk` FOREIGN KEY (`rater_student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_contribution_ratings` ADD CONSTRAINT `group_contribution_ratings_ratee_student_id_users_id_fk` FOREIGN KEY (`ratee_student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worksheet_attempt_member_scores` ADD CONSTRAINT `worksheet_attempt_member_scores_attempt_id_worksheet_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `worksheet_attempts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worksheet_attempt_member_scores` ADD CONSTRAINT `worksheet_attempt_member_scores_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `group_contribution_ratings_attempt_idx` ON `group_contribution_ratings` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `worksheet_attempt_member_scores_attempt_idx` ON `worksheet_attempt_member_scores` (`attempt_id`);