ALTER TABLE `journal_entries` ADD `teacher_response` text;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD `teacher_response_at` timestamp;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD `teacher_responded_by` bigint;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD `reviewed_at` timestamp;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_teacher_responded_by_users_id_fk` FOREIGN KEY (`teacher_responded_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;