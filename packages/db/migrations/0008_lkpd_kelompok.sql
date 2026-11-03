CREATE TABLE `assignment_group_members` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`group_id` bigint NOT NULL,
	`assignment_id` bigint NOT NULL,
	`student_id` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assignment_group_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `assignment_group_members_group_student_unique` UNIQUE(`group_id`,`student_id`),
	CONSTRAINT `assignment_group_members_assignment_student_unique` UNIQUE(`assignment_id`,`student_id`)
);
--> statement-breakpoint
CREATE TABLE `assignment_groups` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`assignment_id` bigint NOT NULL,
	`class_id` bigint NOT NULL,
	`name` varchar(100) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assignment_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `worksheet_attempts` MODIFY COLUMN `student_id` bigint;--> statement-breakpoint
ALTER TABLE `worksheet_attempts` ADD `group_id` bigint;--> statement-breakpoint
ALTER TABLE `worksheet_attempts` ADD `last_edited_by` bigint;--> statement-breakpoint
ALTER TABLE `assignments` ADD `work_mode` enum('individu','kelompok') DEFAULT 'individu' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignments` ADD `group_size` int;--> statement-breakpoint
ALTER TABLE `worksheet_attempts` ADD CONSTRAINT `worksheet_attempts_group_unique` UNIQUE(`worksheet_id`,`group_id`);--> statement-breakpoint
ALTER TABLE `assignment_group_members` ADD CONSTRAINT `assignment_group_members_group_id_assignment_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `assignment_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignment_group_members` ADD CONSTRAINT `assignment_group_members_assignment_id_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignment_group_members` ADD CONSTRAINT `assignment_group_members_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignment_groups` ADD CONSTRAINT `assignment_groups_assignment_id_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignment_groups` ADD CONSTRAINT `assignment_groups_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `assignment_group_members_group_idx` ON `assignment_group_members` (`group_id`);--> statement-breakpoint
CREATE INDEX `assignment_groups_assignment_class_idx` ON `assignment_groups` (`assignment_id`,`class_id`);--> statement-breakpoint
ALTER TABLE `worksheet_attempts` ADD CONSTRAINT `worksheet_attempts_group_id_assignment_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `assignment_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worksheet_attempts` ADD CONSTRAINT `worksheet_attempts_last_edited_by_users_id_fk` FOREIGN KEY (`last_edited_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;