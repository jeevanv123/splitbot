PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bill_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` text NOT NULL,
	`uploader_id` text NOT NULL,
	`items_json` text NOT NULL,
	`image_path` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`assigned_at` integer,
	`expense_id` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_bill_drafts`("id", "group_id", "uploader_id", "items_json", "image_path", "status", "created_at", "assigned_at", "expense_id") SELECT "id", "group_id", "uploader_id", "items_json", "image_path", "status", "created_at", "assigned_at", "expense_id" FROM `bill_drafts`;--> statement-breakpoint
DROP TABLE `bill_drafts`;--> statement-breakpoint
ALTER TABLE `__new_bill_drafts` RENAME TO `bill_drafts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_bill_drafts_group` ON `bill_drafts` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_bill_drafts_uploader` ON `bill_drafts` (`uploader_id`);--> statement-breakpoint
CREATE INDEX `idx_bill_drafts_group_status` ON `bill_drafts` (`group_id`,`status`);--> statement-breakpoint
CREATE TABLE `__new_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` text NOT NULL,
	`paid_by_user_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`description` text NOT NULL,
	`source` text NOT NULL,
	`draft_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`paid_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_expenses`("id", "group_id", "paid_by_user_id", "amount_paise", "description", "source", "draft_id", "created_at") SELECT "id", "group_id", "paid_by_user_id", "amount_paise", "description", "source", "draft_id", "created_at" FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `__new_expenses` RENAME TO `expenses`;--> statement-breakpoint
CREATE INDEX `idx_expenses_group` ON `expenses` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_expenses_payer` ON `expenses` (`paid_by_user_id`);--> statement-breakpoint
CREATE INDEX `idx_expenses_draft` ON `expenses` (`draft_id`);--> statement-breakpoint
CREATE TABLE `__new_splits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`expense_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`share_paise` integer NOT NULL,
	`settled_at` integer,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_splits`("id", "expense_id", "user_id", "share_paise", "settled_at") SELECT "id", "expense_id", "user_id", "share_paise", "settled_at" FROM `splits`;--> statement-breakpoint
DROP TABLE `splits`;--> statement-breakpoint
ALTER TABLE `__new_splits` RENAME TO `splits`;--> statement-breakpoint
CREATE INDEX `idx_splits_expense` ON `splits` (`expense_id`);--> statement-breakpoint
CREATE INDEX `idx_splits_user` ON `splits` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_splits_settled_at` ON `splits` (`settled_at`);