-- Itens A e B do plano: pré-venda sem estoque também na Loja Pública, e
-- data de corte dentro do Período de Vendas (a partir dela, só vende com
-- estoque real). Aditivo — sem preencher, comportamento de sempre.

ALTER TABLE `periodos_venda`
  ADD COLUMN `dataCorte` timestamp NULL;

ALTER TABLE `products`
  ADD COLUMN `allowPreOrder` boolean NOT NULL DEFAULT false;
