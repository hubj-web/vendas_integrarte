-- Loja Pública, fase 3: imagem de produto + liga/desliga forma de entrega na loja.
-- Aditivo — não altera nada do cadastro de produtos ou formas de entrega
-- usado pelo período de vendas/vendedor.

ALTER TABLE `products` ADD COLUMN `imageUrl` text;

CREATE TABLE `store_delivery_method_visibility` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `deliveryMethodId` int NOT NULL UNIQUE,
  `visible` boolean NOT NULL DEFAULT true,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
