-- Aparência da loja editável (título, mensagem de boas-vindas, cor principal)

ALTER TABLE `store_settings`
  ADD COLUMN `storeTitle` varchar(100) NULL,
  ADD COLUMN `welcomeMessage` text NULL,
  ADD COLUMN `primaryColor` varchar(7) NULL;
