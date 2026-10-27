ALTER TABLE `worksheet_attempts` MODIFY COLUMN `status` enum('draf','terkumpul','dinilai') NOT NULL DEFAULT 'draf';--> statement-breakpoint
ALTER TABLE `worksheet_answers` ADD `score` decimal(8,2);--> statement-breakpoint
ALTER TABLE `worksheet_answers` ADD `teacher_note` text;--> statement-breakpoint
ALTER TABLE `worksheet_attempts` ADD `total_score` decimal(8,2);--> statement-breakpoint
ALTER TABLE `worksheet_attempts` ADD `teacher_comment` text;