-- Estoque Integrarte de verdade — substitui o "cliente fake" (Integrarte - Estoque)
-- por tabelas próprias, e adiciona o fluxo de Pedido de Estoque pra fornecedores.

CREATE TABLE `estoque_atual` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `productId` int NOT NULL,
  `quantidade` int NOT NULL DEFAULT 0,
  `custoMedioUnitario` decimal(10,2) NOT NULL DEFAULT '0.00',
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `estoque_atual_flavors` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `estoqueAtualId` int NOT NULL,
  `productFlavorId` int NOT NULL,
  `flavorName` varchar(100) NOT NULL
);

CREATE TABLE `pedidos_estoque` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `fornecedorId` int NOT NULL,
  `descricao` varchar(200),
  `status` enum('rascunho','enviado','recebido','cancelado') NOT NULL DEFAULT 'rascunho',
  `dataEnvio` timestamp NULL,
  `dataRecebimento` timestamp NULL,
  `observacoes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `pedidos_estoque_itens` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `pedidoEstoqueId` int NOT NULL,
  `productId` int NOT NULL,
  `quantidade` int NOT NULL,
  `custoUnitario` decimal(10,2) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

CREATE TABLE `pedidos_estoque_item_flavors` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `pedidoEstoqueItemId` int NOT NULL,
  `productFlavorId` int NOT NULL,
  `flavorName` varchar(100) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Migração dos dados: aproveita o que já está lançado no cliente
-- "Integrarte - Estoque" (pedidos não cancelados), trazendo pro estoque novo.
-- Usa o custo cadastrado no Produto (não o preço de venda) como custo médio.
-- ═══════════════════════════════════════════════════════════════════════════

-- Coluna temporária só pra conseguir religar cada linha nova aos sabores certos
ALTER TABLE `estoque_atual` ADD COLUMN `origemOrderItemId` int;

INSERT INTO `estoque_atual` (`productId`, `quantidade`, `custoMedioUnitario`, `origemOrderItemId`)
SELECT oi.productId, oi.quantity, COALESCE(p.cost, 0.00), oi.id
FROM order_items oi
JOIN orders o ON oi.orderId = o.id
JOIN customers c ON o.customerId = c.id
LEFT JOIN products p ON oi.productId = p.id
WHERE c.isInternal = true AND o.status != 'cancelled' AND oi.quantity > 0;

INSERT INTO `estoque_atual_flavors` (`estoqueAtualId`, `productFlavorId`, `flavorName`)
SELECT ea.id, oif.productFlavorId, oif.flavorName
FROM `estoque_atual` ea
JOIN `order_item_flavors` oif ON oif.orderItemId = ea.origemOrderItemId;

-- Remove a coluna temporária, já cumpriu o papel
ALTER TABLE `estoque_atual` DROP COLUMN `origemOrderItemId`;
