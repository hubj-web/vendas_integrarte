-- Formas de entrega passam a poder ter um custo, que soma no total do
-- pedido da Loja Pública quando o cliente escolhe essa opção. Aditivo —
-- default 0.00 preserva o comportamento de sempre (sem cobrança extra).

ALTER TABLE `delivery_methods`
  ADD COLUMN `cost` decimal(10,2) NOT NULL DEFAULT '0.00';
