CREATE INDEX IF NOT EXISTS `generations_user_created_idx` ON `generations` (`user_email`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `generations_model_created_idx` ON `generations` (`model`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `generations_created_idx` ON `generations` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `orders_status_created_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `orders_paid_idx` ON `orders` (`status`,`paid_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `users_created_idx` ON `users` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `users_plan_expires_idx` ON `users` (`plan`,`plan_expires_at`);
