CREATE TABLE `ai_provider_checks` (
	`provider_id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`ok` integer NOT NULL,
	`resolved_model` text,
	`detail` text NOT NULL,
	`checked_at` integer NOT NULL
);
