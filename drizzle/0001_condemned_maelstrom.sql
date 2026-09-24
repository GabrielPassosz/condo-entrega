CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`condominium_id` integer NOT NULL,
	`actor_profile_id` integer,
	`actor_email` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`condominium_id`) REFERENCES `condominiums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_condo_created_idx` ON `audit_logs` (`condominium_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `notification_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`condominium_id` integer NOT NULL,
	`package_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`locked_at` text,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`condominium_id`) REFERENCES `condominiums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_jobs_package_unique` ON `notification_jobs` (`package_id`);--> statement-breakpoint
CREATE INDEX `notification_jobs_due_idx` ON `notification_jobs` (`status`,`available_at`);--> statement-breakpoint
DROP INDEX `profiles_email_unique`;--> statement-breakpoint
ALTER TABLE `profiles` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_condo_email_unique` ON `profiles` (`condominium_id`,`email`);--> statement-breakpoint
CREATE INDEX `profiles_user_id_idx` ON `profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `profiles_email_idx` ON `profiles` (`email`);--> statement-breakpoint
ALTER TABLE `condominiums` ADD `slug` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `condominiums` ADD `timezone` text DEFAULT 'America/Sao_Paulo' NOT NULL;--> statement-breakpoint
ALTER TABLE `condominiums` ADD `photo_retention_days` integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE `condominiums` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `condominiums` ADD `created_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `condominiums` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `condominiums_slug_unique` ON `condominiums` (`slug`) WHERE "condominiums"."slug" <> '';--> statement-breakpoint
ALTER TABLE `packages` ADD `photo_expires_at` text;--> statement-breakpoint
ALTER TABLE `packages` ADD `photo_deleted_at` text;--> statement-breakpoint
ALTER TABLE `packages` ADD `idempotency_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `packages` ADD `pickup_code_encrypted` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `packages` ADD `pickup_code_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `packages` ADD `notification_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `packages` ADD `last_notification_attempt_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `packages_condo_idempotency_unique` ON `packages` (`condominium_id`,`idempotency_key`) WHERE "packages"."idempotency_key" <> '';--> statement-breakpoint
CREATE INDEX `packages_photo_expiry_idx` ON `packages` (`condominium_id`,`photo_expires_at`);--> statement-breakpoint
ALTER TABLE `residents` ADD `whatsapp_opt_in_at` text;