-- Regras de frete grátis por forma de entrega (valor mínimo do pedido, ou
-- quantidade mínima de um produto específico). Várias regras por forma,
-- qualquer uma satisfeita já libera o frete grátis (lógica "OU").

CREATE TABLE `delivery_method_rules` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `deliveryMethodId` int NOT NULL,
  `ruleType` enum('valor_minimo','quantidade_produto') NOT NULL,
  `minOrderValue` decimal(10,2) NULL,
  `productId` int NULL,
  `minQuantity` int NULL,
  `active` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);
