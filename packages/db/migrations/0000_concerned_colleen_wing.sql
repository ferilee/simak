CREATE TABLE `users` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`ruas_user_id` varchar(64) NOT NULL,
	`username` varchar(64) NOT NULL,
	`name` varchar(150) NOT NULL,
	`role` enum('guru','murid') NOT NULL,
	`nis` varchar(32),
	`is_active` boolean NOT NULL DEFAULT true,
	`last_synced_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_ruas_user_id_unique` UNIQUE(`ruas_user_id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `class_members` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`class_id` bigint NOT NULL,
	`student_id` bigint NOT NULL,
	`joined_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `class_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `class_members_pair_unique` UNIQUE(`class_id`,`student_id`)
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`teacher_id` bigint NOT NULL,
	`name` varchar(100) NOT NULL,
	`subject` varchar(100) NOT NULL,
	`academic_year` varchar(20) NOT NULL,
	`join_code` varchar(12) NOT NULL,
	`is_archived` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `classes_id` PRIMARY KEY(`id`),
	CONSTRAINT `classes_join_code_unique` UNIQUE(`join_code`)
);
--> statement-breakpoint
CREATE TABLE `module_blocks` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`module_id` bigint NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`type` enum('teks','gambar','video','berkas','sub_bab') NOT NULL,
	`content_json` json NOT NULL,
	`attachment_key` varchar(512),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `module_blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modules` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`teacher_id` bigint NOT NULL,
	`title` varchar(200) NOT NULL,
	`subject` varchar(100) NOT NULL,
	`description` text,
	`status` enum('draf','terbit','arsip') NOT NULL DEFAULT 'draf',
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worksheet_items` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`worksheet_id` bigint NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`item_type` enum('isian_singkat','pilihan_ganda','uraian','unggah_foto','langkah_berurutan','refleksi','tautan_ruas') NOT NULL,
	`prompt` text NOT NULL,
	`options_json` json,
	`answer_key` text,
	`explanation` text,
	`rubric_max` int NOT NULL DEFAULT 100,
	`points` int NOT NULL DEFAULT 10,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worksheet_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worksheets` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`module_id` bigint,
	`teacher_id` bigint NOT NULL,
	`title` text NOT NULL,
	`instructions` text,
	`status` enum('draf','terbit','arsip') NOT NULL DEFAULT 'draf',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worksheets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assignment_classes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`assignment_id` bigint NOT NULL,
	`class_id` bigint NOT NULL,
	CONSTRAINT `assignment_classes_id` PRIMARY KEY(`id`),
	CONSTRAINT `assignment_classes_pair_unique` UNIQUE(`assignment_id`,`class_id`)
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`teacher_id` bigint NOT NULL,
	`module_id` bigint,
	`worksheet_id` bigint,
	`title` varchar(200) NOT NULL,
	`instructions` text,
	`ruas_quiz_url` varchar(1024),
	`opens_at` datetime NOT NULL,
	`due_at` datetime NOT NULL,
	`status` enum('draf','terbit','ditutup') NOT NULL DEFAULT 'draf',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `submission_answers` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`submission_id` bigint NOT NULL,
	`worksheet_item_id` bigint NOT NULL,
	`answer_text` text,
	`attachment_key` varchar(512),
	`auto_score` decimal(6,2),
	`manual_score` decimal(6,2),
	`teacher_note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `submission_answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `submission_answers_pair_unique` UNIQUE(`submission_id`,`worksheet_item_id`)
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`assignment_id` bigint NOT NULL,
	`student_id` bigint NOT NULL,
	`status` enum('belum','draf','terkumpul','terlambat','dinilai') NOT NULL DEFAULT 'belum',
	`started_at` datetime,
	`submitted_at` datetime,
	`total_score` decimal(6,2),
	`teacher_comment` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `submissions_assignment_student_unique` UNIQUE(`assignment_id`,`student_id`)
);
--> statement-breakpoint
CREATE TABLE `activity_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`student_id` bigint NOT NULL,
	`assignment_id` bigint,
	`event` enum('buka_materi','mulai_lkpd','kumpul','buka_kuis_ruas','exit_ticket') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exit_tickets` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`assignment_id` bigint NOT NULL,
	`student_id` bigint NOT NULL,
	`understood_3` text NOT NULL,
	`examples_2` text NOT NULL,
	`confusing_1` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exit_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `exit_tickets_pair_unique` UNIQUE(`assignment_id`,`student_id`)
);
--> statement-breakpoint
ALTER TABLE `class_members` ADD CONSTRAINT `class_members_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_members` ADD CONSTRAINT `class_members_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classes` ADD CONSTRAINT `classes_teacher_id_users_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `module_blocks` ADD CONSTRAINT `module_blocks_module_id_modules_id_fk` FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `modules` ADD CONSTRAINT `modules_teacher_id_users_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worksheet_items` ADD CONSTRAINT `worksheet_items_worksheet_id_worksheets_id_fk` FOREIGN KEY (`worksheet_id`) REFERENCES `worksheets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worksheets` ADD CONSTRAINT `worksheets_module_id_modules_id_fk` FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worksheets` ADD CONSTRAINT `worksheets_teacher_id_users_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignment_classes` ADD CONSTRAINT `assignment_classes_assignment_id_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignment_classes` ADD CONSTRAINT `assignment_classes_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_teacher_id_users_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_module_id_modules_id_fk` FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_worksheet_id_worksheets_id_fk` FOREIGN KEY (`worksheet_id`) REFERENCES `worksheets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_answers` ADD CONSTRAINT `submission_answers_submission_id_submissions_id_fk` FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_answers` ADD CONSTRAINT `submission_answers_worksheet_item_id_worksheet_items_id_fk` FOREIGN KEY (`worksheet_item_id`) REFERENCES `worksheet_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_assignment_id_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_assignment_id_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exit_tickets` ADD CONSTRAINT `exit_tickets_assignment_id_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exit_tickets` ADD CONSTRAINT `exit_tickets_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `class_members_student_idx` ON `class_members` (`student_id`);--> statement-breakpoint
CREATE INDEX `module_blocks_module_idx` ON `module_blocks` (`module_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `worksheet_items_worksheet_idx` ON `worksheet_items` (`worksheet_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `assignment_classes_class_idx` ON `assignment_classes` (`class_id`);--> statement-breakpoint
CREATE INDEX `assignments_teacher_idx` ON `assignments` (`teacher_id`,`opens_at`);--> statement-breakpoint
CREATE INDEX `submissions_student_idx` ON `submissions` (`student_id`);--> statement-breakpoint
CREATE INDEX `activity_logs_assignment_idx` ON `activity_logs` (`assignment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_logs_student_idx` ON `activity_logs` (`student_id`,`created_at`);