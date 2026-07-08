CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);

CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`phone` varchar(30) NOT NULL,
	`locationReference` text,
	`street` varchar(200),
	`number` varchar(20),
	`neighborhood` varchar(100),
	`city` varchar(100),
	`zipCode` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);

CREATE TABLE `delivery_methods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`description` text,
	`requiresAddress` boolean NOT NULL DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `delivery_methods_id` PRIMARY KEY(`id`)
);

CREATE TABLE `delivery_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`deliveryUserId` int NOT NULL,
	`deliveredAt` timestamp NOT NULL,
	`notes` text,
	`proofImageUrl` text,
	`proofImageKey` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `delivery_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `delivery_records_orderId_unique` UNIQUE(`orderId`)
);

CREATE TABLE `delivery_routes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`deliveryDate` timestamp NOT NULL,
	`deliveryUserId` int NOT NULL,
	`startingAddress` text,
	`totalDistance` decimal(10, 2) DEFAULT '0.00',
	`status` enum('planned','in_progress','completed') NOT NULL DEFAULT 'planned',
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `delivery_routes_id` PRIMARY KEY(`id`)
);

CREATE TABLE `jelly_flavors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`price` decimal(10,2) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `jelly_flavors_id` PRIMARY KEY(`id`)
);

CREATE TABLE `minipizza_flavors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`additionalPrice` decimal(10,2) DEFAULT '0.00',
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `minipizza_flavors_id` PRIMARY KEY(`id`)
);

CREATE TABLE `minipizza_type_flavor_matrix` (
	`id` int AUTO_INCREMENT NOT NULL,
	`minipizzaTypeId` int NOT NULL,
	`minipizzaFlavorId` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `minipizza_type_flavor_matrix_id` PRIMARY KEY(`id`)
);

CREATE TABLE `minipizza_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`units` int NOT NULL,
	`price` decimal(10,2) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `minipizza_types_id` PRIMARY KEY(`id`)
);

CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`productId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` decimal(10,2) NOT NULL,
	`subtotal` decimal(10,2) NOT NULL,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);

CREATE TABLE `order_jellies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`jellyFlavorId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` decimal(10,2) NOT NULL,
	`subtotal` decimal(10,2) NOT NULL,
	CONSTRAINT `order_jellies_id` PRIMARY KEY(`id`)
);

CREATE TABLE `order_minipizza_flavors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderMinipizzaId` int NOT NULL,
	`minipizzaFlavorId` int NOT NULL,
	CONSTRAINT `order_minipizza_flavors_id` PRIMARY KEY(`id`)
);

CREATE TABLE `order_minipizzas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`minipizzaTypeId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` decimal(10,2) NOT NULL,
	`subtotal` decimal(10,2) NOT NULL,
	CONSTRAINT `order_minipizzas_id` PRIMARY KEY(`id`)
);

CREATE TABLE `order_status_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`userId` int NOT NULL,
	`fromStatus` varchar(50),
	`toStatus` varchar(50) NOT NULL,
	`notes` text,
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_status_history_id` PRIMARY KEY(`id`)
);

CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`launcherId` int NOT NULL,
	`deliveryMethodId` int NOT NULL,
	`deliveryDate` timestamp,
	`deliveryAddress` text,
	`paymentMethod` enum('cash','pix') NOT NULL,
	`status` enum('production','in_route','delivered','paid','cancelled') NOT NULL DEFAULT 'production',
	`paymentStatus` enum('pending','paid','partial','cancelled') NOT NULL DEFAULT 'pending',
	`totalAmount` decimal(10,2) NOT NULL,
	`notes` text,
	`cancelReason` text,
	`cancelledBy` int,
	`cancelledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);

CREATE TABLE `payment_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`paymentMethod` enum('cash','pix') NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`paidAt` timestamp NOT NULL,
	`notes` text,
	`proofImageUrl` text,
	`proofImageKey` varchar(500),
	`registeredBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_records_id` PRIMARY KEY(`id`)
);

CREATE TABLE `product_change_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`userId` int NOT NULL,
	`field` varchar(100) NOT NULL,
	`oldValue` text,
	`newValue` text,
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_change_history_id` PRIMARY KEY(`id`)
);

CREATE TABLE `product_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_types_name_unique` UNIQUE(`name`)
);

CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`productTypeId` int NOT NULL,
	`unit` varchar(50) NOT NULL,
	`price` decimal(10,2) NOT NULL,
	`description` text,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);

CREATE TABLE `route_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` int NOT NULL,
	`orderId` int NOT NULL,
	`position` int NOT NULL,
	`distanceFromPrevious` decimal(10, 2) DEFAULT '0.00',
	CONSTRAINT `route_orders_id` PRIMARY KEY(`id`)
);

ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);
ALTER TABLE `users` MODIFY COLUMN `name` text NOT NULL;
ALTER TABLE `users` MODIFY COLUMN `email` varchar(320) NOT NULL;
ALTER TABLE `users` MODIFY COLUMN `loginMethod` varchar(64) DEFAULT 'local';
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','launcher','delivery') NOT NULL DEFAULT 'launcher';
ALTER TABLE `users` ADD `passwordHash` varchar(255);
ALTER TABLE `users` ADD `active` boolean DEFAULT true NOT NULL;
ALTER TABLE `users` ADD `mustChangePassword` boolean DEFAULT false NOT NULL;
ALTER TABLE `users` ADD `resetToken` varchar(128);
ALTER TABLE `users` ADD `resetTokenExpiresAt` timestamp;
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);
ALTER TABLE `product_types` ADD `category` varchar(100);
