-- Item C do plano: Formas de Pagamento como cadastro, controlando o que
-- aparece em cada lugar (Venda Regular, cada Evento). Não muda a lógica
-- técnica de nenhuma forma de pagamento — só controla onde ela aparece.

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

-- Semeia as 4 formas de pagamento que já existem e funcionam no sistema hoje.
INSERT INTO `payment_methods` (`code`, `name`, `description`, `active`) VALUES
  ('pix_loja', 'PIX (Loja Pública)', 'QR code estático direto pro CNPJ da instituição — confirmação manual', true),
  ('cartao_loja', 'Cartão de Crédito (Loja Pública)', 'Via Mercado Pago (Payment Brick)', true),
  ('dinheiro_vendedor', 'Dinheiro (Vendedor)', 'Pagamento combinado direto com o cliente, lançado pelo vendedor', true),
  ('pix_vendedor', 'PIX (Vendedor)', 'Pagamento combinado direto com o cliente, lançado pelo vendedor', true);
