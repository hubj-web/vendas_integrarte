-- Loja Pública, fase 4:
-- 1) Controle de quais categorias aparecem na Venda Regular (opt-out, não
--    muda nada até alguém desligar uma categoria explicitamente).
-- 2) Grupos de variação múltipla (produto com várias escolhas ao mesmo
--    tempo, ex: tipo de macarrão + molho + condimentos) — sistema novo e
--    independente do "sabor" que já existe.
-- Tudo aditivo.

CREATE TABLE `store_regular_category_visibility` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `categoryId` int NOT NULL UNIQUE,
  `visible` boolean NOT NULL DEFAULT true,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `product_variation_groups` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `productId` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `required` boolean NOT NULL DEFAULT true,
  `allowMultiple` boolean NOT NULL DEFAULT false,
  `sortOrder` int NOT NULL DEFAULT 0
);

CREATE TABLE `product_variation_options` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `groupId` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `additionalPrice` decimal(10,2) NOT NULL DEFAULT '0.00',
  `sortOrder` int NOT NULL DEFAULT 0
);

CREATE TABLE `order_item_variation_selections` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `orderItemId` int NOT NULL,
  `groupName` varchar(100) NOT NULL,
  `optionName` varchar(100) NOT NULL,
  `additionalPrice` decimal(10,2) NOT NULL DEFAULT '0.00'
);
