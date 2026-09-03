-- Controles de tipografia (fonte, tamanho, cor) separados pro título e pra
-- mensagem de boas-vindas da tela inicial da loja.

ALTER TABLE `store_settings`
  ADD COLUMN `titleFontFamily` varchar(50) NULL,
  ADD COLUMN `titleFontSize` int NULL,
  ADD COLUMN `titleColor` varchar(7) NULL,
  ADD COLUMN `messageFontFamily` varchar(50) NULL,
  ADD COLUMN `messageFontSize` int NULL,
  ADD COLUMN `messageColor` varchar(7) NULL;
