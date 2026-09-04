-- Cada produto pode ter suas próprias formas de entrega permitidas (dentro
-- de evento), e alguns produtos podem não precisar de nenhuma (ex: ingresso).

ALTER TABLE `products`
  ADD COLUMN `requiresDelivery` boolean NOT NULL DEFAULT true;

CREATE TABLE `product_delivery_methods` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `productId` int NOT NULL,
  `deliveryMethodId` int NOT NULL
);
