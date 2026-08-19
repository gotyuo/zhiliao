CREATE TABLE `backup_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`sizeBytes` int NOT NULL DEFAULT 0,
	`status` enum('completed','failed') NOT NULL DEFAULT 'completed',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backup_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `backup_records_filename_unique` UNIQUE(`filename`)
);
--> statement-breakpoint
CREATE TABLE `backup_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`intervalHours` int NOT NULL DEFAULT 24,
	`retentionDays` int NOT NULL DEFAULT 30,
	`updatedById` int,
	`lastRunAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `backup_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `backup_settings` ADD CONSTRAINT `backup_settings_updatedById_users_id_fk` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `backup_records_created_idx` ON `backup_records` (`createdAt`);