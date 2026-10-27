CREATE TABLE `ruas_scores` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`assignment_id` bigint NOT NULL,
	`teacher_id` bigint NOT NULL,
	`student_id` bigint,
	`identifier` varchar(64) NOT NULL,
	`student_name` varchar(150),
	`score` decimal(8,2) NOT NULL,
	`match_status` enum('cocok','tidak_ditemukan','duplikat') NOT NULL,
	`note` varchar(255),
	`imported_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ruas_scores_id` PRIMARY KEY(`id`),
	CONSTRAINT `ruas_scores_assignment_id_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `ruas_scores_teacher_id_users_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `ruas_scores_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `ruas_scores_assignment_idx` ON `ruas_scores` (`assignment_id`,`match_status`);
--> statement-breakpoint
CREATE INDEX `ruas_scores_student_idx` ON `ruas_scores` (`student_id`);
