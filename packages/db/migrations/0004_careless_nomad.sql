CREATE TABLE `integrity_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`student_id` bigint NOT NULL,
	`assignment_id` bigint NOT NULL,
	`event` enum('visibility_hidden','window_blur','copy_attempt','paste_attempt','context_menu') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `integrity_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `integrity_events` ADD CONSTRAINT `integrity_events_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integrity_events` ADD CONSTRAINT `integrity_events_assignment_id_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `integrity_events_assignment_idx` ON `integrity_events` (`assignment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `integrity_events_student_idx` ON `integrity_events` (`student_id`,`created_at`);
