-- Forma de entrega por item do pedido (só usada dentro de Eventos, pra casos
-- tipo "sobremesa consumo no local" + "marmitex retirada" no mesmo pedido).

ALTER TABLE `order_items`
  ADD COLUMN `deliveryMethodId` int NULL;
