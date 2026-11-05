ALTER TABLE `modules` ADD `share_status` enum('pribadi','menunggu','dibagikan','ditolak') DEFAULT 'pribadi' NOT NULL;--> statement-breakpoint
ALTER TABLE `modules` ADD `share_requested_at` datetime;--> statement-breakpoint
ALTER TABLE `worksheets` ADD `share_status` enum('pribadi','menunggu','dibagikan','ditolak') DEFAULT 'pribadi' NOT NULL;--> statement-breakpoint
ALTER TABLE `worksheets` ADD `share_requested_at` datetime;--> statement-breakpoint
UPDATE `modules` SET `share_status` = 'dibagikan' WHERE `is_shared` = true;--> statement-breakpoint
UPDATE `worksheets` SET `share_status` = 'dibagikan' WHERE `is_shared` = true;
