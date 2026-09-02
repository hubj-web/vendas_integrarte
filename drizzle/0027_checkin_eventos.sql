-- Check-in de ingressos/comprovantes na entrada do evento — código de acesso
-- por evento (pra voluntários sem login) + marca de "já usado" no pedido.

ALTER TABLE `store_events`
  ADD COLUMN `checkInCode` varchar(6) NULL;

ALTER TABLE `orders`
  ADD COLUMN `checkedInAt` timestamp NULL;
