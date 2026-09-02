-- Reestruturação do "sob encomenda": deixa de depender do Período de Vendas
-- global (que agora serve só pro vendedor) e passa a ser configurado direto
-- no produto, com uma data de corte própria (opcional). Também adiciona
-- janela de disponibilidade por categoria (data E hora), pra casos como
-- "essa categoria só libera no dia/horário do evento".

ALTER TABLE `products`
  ADD COLUMN `preOrderUntil` timestamp NULL;

ALTER TABLE `product_categories`
  ADD COLUMN `availableFrom` timestamp NULL,
  ADD COLUMN `availableUntil` timestamp NULL;
