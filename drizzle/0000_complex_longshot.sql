CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`scene` text NOT NULL,
	`topic` text NOT NULL,
	`style` text NOT NULL,
	`result_json` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`product` text NOT NULL,
	`amount_fen` integer NOT NULL,
	`status` text NOT NULL,
	`provider_trade_no` text,
	`created_at` integer NOT NULL,
	`paid_at` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`plan_expires_at` integer,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
