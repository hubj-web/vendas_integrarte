-- Loja Pública — venda on-line sem login, exclusivamente do Estoque Integrarte.
-- Tudo aditivo: nenhuma tabela existente é alterada de forma destrutiva, e o
-- fluxo de período de vendas / vendedor continua exatamente como está.

-- Canal do pedido (de onde ele veio). Default 'periodo' preserva o
-- comportamento de todos os pedidos já existentes.
ALTER TABLE `orders`
  ADD COLUMN `channel` enum('periodo','loja_publica') NOT NULL DEFAULT 'periodo';

-- Cartão de crédito passa a ser uma forma de pagamento válida (além de
-- cash/pix que já existiam) — necessário para o checkout da loja via Mercado Pago.
ALTER TABLE `orders`
  MODIFY COLUMN `paymentMethod` enum('cash','pix','credit_card') NOT NULL;

CREATE TABLE `store_settings` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `isOpen` boolean NOT NULL DEFAULT false,
  `closedMessage` text,
  `updatedBy` int,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

-- Uma única linha de configuração, criada fechada por padrão.
INSERT INTO `store_settings` (`isOpen`) VALUES (false);

CREATE TABLE `store_product_visibility` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `productId` int NOT NULL UNIQUE,
  `visible` boolean NOT NULL DEFAULT true,
  `storePrice` decimal(10,2),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `store_order_payments` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `orderId` int NOT NULL UNIQUE,
  `method` enum('pix','credit_card') NOT NULL,
  `status` enum('pending','approved','rejected','cancelled','expired') NOT NULL DEFAULT 'pending',
  `mpPaymentId` varchar(100),
  `mpPreferenceId` varchar(100),
  `qrCode` text,
  `qrCodeBase64` text,
  `amount` decimal(10,2) NOT NULL,
  `expiresAt` timestamp NULL,
  `approvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

-- Usuário de sistema usado como "launcherId" nos pedidos da loja pública
-- (a tabela orders exige um usuário responsável — não existe cliente logado
-- na loja, então usamos esta conta fixa, sem senha e inativa, só para
-- satisfazer a referência). Nunca consegue fazer login (passwordHash nulo +
-- active=false já bloqueiam isso em server/routers/auth.ts).
INSERT IGNORE INTO `users` (`name`, `email`, `passwordHash`, `role`, `roles`, `active`)
VALUES ('Loja Pública (sistema)', 'loja-publica@sistema.integrarte.local', NULL, 'launcher', '["launcher"]', false);
