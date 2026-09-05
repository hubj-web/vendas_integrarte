-- Cada item do pedido sabe de qual Evento veio (null = Venda Regular).
-- Permite misturar no mesmo pedido: pão de queijo (comum) + ingresso de
-- evento, por exemplo — cada item mantém sua própria origem.

ALTER TABLE `order_items`
  ADD COLUMN `eventId` int NULL;
