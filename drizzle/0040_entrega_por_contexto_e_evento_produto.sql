-- Cada forma de entrega liga/desliga independente pra Venda Regular e pra
-- Eventos. Substitui o mecanismo antigo (store_delivery_method_visibility).
ALTER TABLE `delivery_methods`
  ADD COLUMN `activeRegular` boolean NOT NULL DEFAULT true,
  ADD COLUMN `activeEvents` boolean NOT NULL DEFAULT true;

-- Formas de entrega permitidas por produto, DENTRO de um evento específico
-- (o mesmo produto pode estar em vários eventos com entregas diferentes).
CREATE TABLE `event_product_delivery_methods` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `eventId` int NOT NULL,
  `productId` int NOT NULL,
  `deliveryMethodId` int NOT NULL
);
