ALTER TABLE `modules` ADD `is_shared` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `modules` ADD `shared_at` datetime;--> statement-breakpoint
ALTER TABLE `modules` ADD `copied_from_id` bigint;--> statement-breakpoint
ALTER TABLE `modules` ADD `copied_from_teacher_name` varchar(120);--> statement-breakpoint
ALTER TABLE `worksheets` ADD `is_shared` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `worksheets` ADD `shared_at` datetime;--> statement-breakpoint
ALTER TABLE `worksheets` ADD `copied_from_id` bigint;--> statement-breakpoint
ALTER TABLE `worksheets` ADD `copied_from_teacher_name` varchar(120);
