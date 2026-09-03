-- Instagram e site da instituição, mostrados no rodapé da Loja Pública
-- (junto com o WhatsApp que já existia).

ALTER TABLE `store_settings`
  ADD COLUMN `instagramUrl` varchar(255) NULL,
  ADD COLUMN `websiteUrl` varchar(255) NULL;
