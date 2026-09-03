-- Novos status de pedido (Recebido = ponto de partida agora; Entrega sem
-- sucesso = novo). O status "production" continua existindo, mas pedidos
-- novos passam a nascer como "received".
ALTER TABLE `orders`
  MODIFY COLUMN `status` enum('received','production','in_route','packaged','delivered','delivery_failed','paid','cancelled') NOT NULL DEFAULT 'production';

-- Logo customizável da loja (upload em Loja Pública → Aparência)
ALTER TABLE `store_settings`
  ADD COLUMN `logoUrl` longtext NULL;
