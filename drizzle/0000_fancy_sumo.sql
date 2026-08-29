CREATE TABLE `condominiums` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_id` integer NOT NULL,
	`channel` text DEFAULT 'whatsapp' NOT NULL,
	`status` text NOT NULL,
	`remote_id` text DEFAULT '' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_logs_package_idx` ON `message_logs` (`package_id`);--> statement-breakpoint
CREATE TABLE `packages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`condominium_id` integer NOT NULL,
	`resident_id` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`tracking_code` text DEFAULT '' NOT NULL,
	`scan_text` text DEFAULT '' NOT NULL,
	`photo_key` text NOT NULL,
	`photo_mime` text NOT NULL,
	`pickup_code` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`notification_status` text DEFAULT 'pending' NOT NULL,
	`notification_error` text DEFAULT '' NOT NULL,
	`whatsapp_message_id` text DEFAULT '' NOT NULL,
	`registered_by` text NOT NULL,
	`withdrawn_by` text DEFAULT '' NOT NULL,
	`failed_pickup_attempts` integer DEFAULT 0 NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`notified_at` text,
	`withdrawn_at` text,
	FOREIGN KEY (`condominium_id`) REFERENCES `condominiums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `packages_condo_status_idx` ON `packages` (`condominium_id`,`status`);--> statement-breakpoint
CREATE INDEX `packages_resident_idx` ON `packages` (`resident_id`);--> statement-breakpoint
CREATE INDEX `packages_received_idx` ON `packages` (`received_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`condominium_id` integer NOT NULL,
	`resident_id` integer,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'resident' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`condominium_id`) REFERENCES `condominiums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_email_unique` ON `profiles` (`email`);--> statement-breakpoint
CREATE INDEX `profiles_condo_role_idx` ON `profiles` (`condominium_id`,`role`);--> statement-breakpoint
CREATE TABLE `residents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`condominium_id` integer NOT NULL,
	`unit` text NOT NULL,
	`block` text DEFAULT '' NOT NULL,
	`apartment` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`authorized_people` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`normalized_name` text NOT NULL,
	`normalized_unit` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`condominium_id`) REFERENCES `condominiums`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `residents_condo_name_unit_unique` ON `residents` (`condominium_id`,`normalized_name`,`normalized_unit`);--> statement-breakpoint
CREATE INDEX `residents_condo_active_idx` ON `residents` (`condominium_id`,`active`);--> statement-breakpoint
CREATE INDEX `residents_email_idx` ON `residents` (`email`);