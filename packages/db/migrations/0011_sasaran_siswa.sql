CREATE TABLE `assignment_students` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`assignment_id` bigint NOT NULL,
	`student_id` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assignment_students_id` PRIMARY KEY(`id`),
	CONSTRAINT `assignment_students_pair_unique` UNIQUE(`assignment_id`,`student_id`)
);
--> statement-breakpoint
ALTER TABLE `assignments` ADD `target_type` enum('kelas','siswa') DEFAULT 'kelas' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_students` ADD CONSTRAINT `assignment_students_assignment_id_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignment_students` ADD CONSTRAINT `assignment_students_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `assignment_students_student_idx` ON `assignment_students` (`student_id`);