-- Item 4 do plano: "Campanha" — janela de venda que abre/fecha sozinha,
-- reaproveitando o interruptor manual já existente pra exceções. Aditivo —
-- sem preencher as datas, tudo continua exatamente como está hoje.

ALTER TABLE `store_settings`
  ADD COLUMN `saleStartsAt` timestamp NULL,
  ADD COLUMN `saleEndsAt` timestamp NULL;

ALTER TABLE `store_events`
  ADD COLUMN `saleStartsAt` timestamp NULL,
  ADD COLUMN `saleEndsAt` timestamp NULL;
