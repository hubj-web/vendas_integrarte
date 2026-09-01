-- ══════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO PARA PRODUÇÃO — consolida as migrações 0016 a 0025
-- Rodar ANTES de subir o código novo (o código antigo ignora essas
-- colunas/tabelas novas sem problema — mas o código novo PRECISA delas).
-- Tudo aditivo: nenhum dado existente é apagado ou alterado.
-- ══════════════════════════════════════════════════════════════════════

-- ── 0016: Eventos da Loja ──────────────────────────────────────────────
ALTER TABLE `orders`
  ADD COLUMN `eventId` int,
  ADD COLUMN `ticketCode` varchar(20),
  MODIFY COLUMN `channel` enum('periodo','loja_publica','vendedor_evento') NOT NULL DEFAULT 'periodo';

CREATE TABLE `store_events` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `name` varchar(150) NOT NULL,
  `type` enum('ingresso','produtos') NOT NULL DEFAULT 'produtos',
  `description` text,
  `imageUrl` text,
  `isOpen` boolean NOT NULL DEFAULT false,
  `eventDate` timestamp NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `store_event_categories` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `eventId` int NOT NULL,
  `categoryId` int NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0
);

-- ── 0017: imagens em longtext ──────────────────────────────────────────
ALTER TABLE `product_categories` MODIFY COLUMN `imageUrl` longtext;
ALTER TABLE `products` MODIFY COLUMN `imageUrl` longtext;
ALTER TABLE `store_events` MODIFY COLUMN `imageUrl` longtext;

-- ── 0018: Venda Regular por categoria + grupos de variação ─────────────
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

-- ── 0019: tamanho de destaque ───────────────────────────────────────────
ALTER TABLE `product_categories`
  ADD COLUMN `displaySize` enum('pequeno','medio','grande') NOT NULL DEFAULT 'medio';

ALTER TABLE `products`
  ADD COLUMN `displaySize` enum('pequeno','medio','grande') NOT NULL DEFAULT 'medio';

-- ── 0020: lote/validade + auditoria ─────────────────────────────────────
ALTER TABLE `estoque_atual`
  ADD COLUMN `lote` varchar(50),
  ADD COLUMN `validade` timestamp NULL,
  ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());

CREATE TABLE `activity_log` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `userId` int,
  `userName` varchar(100),
  `action` varchar(100) NOT NULL,
  `entityType` varchar(50),
  `entityId` int,
  `description` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- ── 0021: janela de venda automática ────────────────────────────────────
ALTER TABLE `store_settings`
  ADD COLUMN `saleStartsAt` timestamp NULL,
  ADD COLUMN `saleEndsAt` timestamp NULL;

ALTER TABLE `store_events`
  ADD COLUMN `saleStartsAt` timestamp NULL,
  ADD COLUMN `saleEndsAt` timestamp NULL;

-- ── 0022: custo de entrega ───────────────────────────────────────────────
ALTER TABLE `delivery_methods`
  ADD COLUMN `cost` decimal(10,2) NOT NULL DEFAULT '0.00';

-- ── 0023: pré-venda sem estoque + data de corte ─────────────────────────
ALTER TABLE `periodos_venda`
  ADD COLUMN `dataCorte` timestamp NULL;

ALTER TABLE `products`
  ADD COLUMN `allowPreOrder` boolean NOT NULL DEFAULT false;

-- ── 0024: Formas de Pagamento (já com o texto corrigido) ────────────────
CREATE TABLE `payment_methods` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `code` enum('pix_loja','cartao_loja','dinheiro_vendedor','pix_vendedor') NOT NULL UNIQUE,
  `name` varchar(100) NOT NULL,
  `description` text,
  `active` boolean NOT NULL DEFAULT true
);

CREATE TABLE `store_regular_payment_method_visibility` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `paymentMethodId` int NOT NULL UNIQUE,
  `visible` boolean NOT NULL DEFAULT true
);

CREATE TABLE `store_event_payment_method_visibility` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `eventId` int NOT NULL,
  `paymentMethodId` int NOT NULL,
  `visible` boolean NOT NULL DEFAULT true
);

-- IMPORTANTE: o Cartão de Crédito/Débito começa DESATIVADO em produção de
-- propósito — só ative depois de confirmar que as credenciais de PRODUÇÃO
-- do Mercado Pago (não as de teste) estão configuradas certinho.
INSERT INTO `payment_methods` (`code`, `name`, `description`, `active`) VALUES
  ('pix_loja', 'PIX (Loja Pública)', 'QR code estático direto pro CNPJ da instituição — confirmação manual', true),
  ('cartao_loja', 'Cartão de Crédito/Débito (Loja Pública)', 'Via Mercado Pago (Payment Brick) — aceita crédito e débito', false),
  ('dinheiro_vendedor', 'Dinheiro (Vendedor)', 'Pagamento combinado direto com o cliente, lançado pelo vendedor', true),
  ('pix_vendedor', 'PIX (Vendedor)', 'Pagamento combinado direto com o cliente, lançado pelo vendedor', true);

-- ── 0025: cartão/débito manual pro vendedor ─────────────────────────────
ALTER TABLE `orders`
  MODIFY COLUMN `paymentMethod` enum('cash','pix','credit_card','debit_card') NOT NULL;

ALTER TABLE `payment_methods`
  MODIFY COLUMN `code` enum('pix_loja','cartao_loja','dinheiro_vendedor','pix_vendedor','cartao_vendedor','debito_vendedor') NOT NULL;

INSERT INTO `payment_methods` (`code`, `name`, `description`, `active`) VALUES
  ('cartao_vendedor', 'Cartão de Crédito (Vendedor)', 'Pago na maquininha do vendedor por fora do sistema — só registra qual foi usada', true),
  ('debito_vendedor', 'Cartão de Débito (Vendedor)', 'Pago na maquininha do vendedor por fora do sistema — só registra qual foi usada', true);
