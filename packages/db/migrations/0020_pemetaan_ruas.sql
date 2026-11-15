ALTER TABLE `assignments` ADD `ruas_topic_id` int;--> statement-breakpoint
ALTER TABLE `assignments` ADD `ruas_subject_id` int;--> statement-breakpoint
ALTER TABLE `ruas_scores` ADD `source` enum('csv','tarik') DEFAULT 'csv' NOT NULL;--> statement-breakpoint
ALTER TABLE `ruas_scores` ADD `pulled_at` timestamp;