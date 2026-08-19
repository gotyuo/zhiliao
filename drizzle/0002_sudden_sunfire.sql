CREATE TABLE `patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientNo` varchar(32) NOT NULL,
	`fullName` varchar(80) NOT NULL,
	`gender` enum('male','female','unknown') NOT NULL DEFAULT 'unknown',
	`birthDate` timestamp,
	`mobile` varchar(32),
	`idNumber` varchar(64),
	`address` varchar(255),
	`qrToken` varchar(80) NOT NULL,
	`prescribedTotal` int NOT NULL DEFAULT 0,
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `patients_patientNo_unique` UNIQUE(`patientNo`),
	CONSTRAINT `patients_qrToken_unique` UNIQUE(`qrToken`)
);
--> statement-breakpoint
CREATE TABLE `staff_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(64),
	`passwordHash` varchar(255),
	`employeeNo` varchar(32),
	`title` varchar(64),
	`staffRole` enum('admin','doctor','frontdesk') NOT NULL DEFAULT 'frontdesk',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_profiles_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `staff_profiles_username_uq` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `treatment_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(100) NOT NULL,
	`durationMinutes` int NOT NULL DEFAULT 30,
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `treatment_projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `treatment_projects_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `treatment_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int NOT NULL,
	`treatmentProjectId` int NOT NULL,
	`scheduledAt` timestamp NOT NULL,
	`durationMinutes` int NOT NULL DEFAULT 30,
	`status` enum('scheduled','checked_in','called','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
	`checkedInAt` timestamp,
	`calledAt` timestamp,
	`completedAt` timestamp,
	`performerId` int,
	`cancellationReason` varchar(255),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `treatment_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `staff_profiles` ADD CONSTRAINT `staff_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treatment_schedules` ADD CONSTRAINT `treatment_schedules_patientId_patients_id_fk` FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treatment_schedules` ADD CONSTRAINT `treatment_schedules_doctorId_staff_profiles_id_fk` FOREIGN KEY (`doctorId`) REFERENCES `staff_profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treatment_schedules` ADD CONSTRAINT `treatment_schedules_treatmentProjectId_treatment_projects_id_fk` FOREIGN KEY (`treatmentProjectId`) REFERENCES `treatment_projects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treatment_schedules` ADD CONSTRAINT `treatment_schedules_performerId_staff_profiles_id_fk` FOREIGN KEY (`performerId`) REFERENCES `staff_profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `patients_name_idx` ON `patients` (`fullName`);--> statement-breakpoint
CREATE INDEX `patients_active_idx` ON `patients` (`isActive`);--> statement-breakpoint
CREATE INDEX `staff_profiles_role_idx` ON `staff_profiles` (`staffRole`);--> statement-breakpoint
CREATE INDEX `treatment_projects_active_idx` ON `treatment_projects` (`isActive`);--> statement-breakpoint
CREATE INDEX `treatment_schedules_time_idx` ON `treatment_schedules` (`scheduledAt`);--> statement-breakpoint
CREATE INDEX `treatment_schedules_patient_idx` ON `treatment_schedules` (`patientId`);--> statement-breakpoint
CREATE INDEX `treatment_schedules_doctor_idx` ON `treatment_schedules` (`doctorId`);--> statement-breakpoint
CREATE INDEX `treatment_schedules_status_idx` ON `treatment_schedules` (`status`);