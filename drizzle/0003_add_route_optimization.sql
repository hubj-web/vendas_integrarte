ALTER TABLE `delivery_routes` ADD COLUMN `startingAddress` text NOT NULL DEFAULT 'Rua Eloi da Costa, 145, Luizote de Freitas, Uberlândia, MG' AFTER `deliveryUserId`;
ALTER TABLE `delivery_routes` ADD COLUMN `totalDistance` decimal(10, 2) DEFAULT '0.00' AFTER `startingAddress`;
ALTER TABLE `route_orders` ADD COLUMN `distanceFromPrevious` decimal(10, 2) DEFAULT '0.00' AFTER `position`;
