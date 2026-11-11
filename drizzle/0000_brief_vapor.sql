CREATE TABLE `demos` (
	`id` text PRIMARY KEY NOT NULL,
	`salt` text NOT NULL,
	`normal` text NOT NULL,
	`duress` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`ledger` text NOT NULL
);
