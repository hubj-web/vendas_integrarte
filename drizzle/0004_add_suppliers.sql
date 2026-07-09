-- Migration 0004: Adicionar tabela de fornecedores (suppliers) e relacionamentos

CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`contactName` varchar(150),
	`phone` varchar(50),
	`email` varchar(150) DEFAULT '',
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

-- Adicionar coluna supplierId na tabela products (relacionamento com fornecedores)
ALTER TABLE `products` ADD COLUMN `supplierId` int;
--> statement-breakpoint

-- Adicionar coluna supplierId na tabela minipizza_types (relacionamento com fornecedores)
ALTER TABLE `minipizza_types` ADD COLUMN `supplierId` int;
