ALTER TABLE `activity_logs` ADD `module_id` bigint;--> statement-breakpoint
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_module_id_modules_id_fk` FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activity_logs_module_idx` ON `activity_logs` (`module_id`,`created_at`);--> statement-breakpoint
UPDATE `activity_logs` AS `al` INNER JOIN `assignments` AS `a` ON `a`.`id` = `al`.`assignment_id` SET `al`.`module_id` = `a`.`module_id` WHERE `al`.`event` = 'buka_materi' AND `a`.`module_id` IS NOT NULL;