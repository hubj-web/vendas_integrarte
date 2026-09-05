-- Endereço, CNPJ (opcional), forma de pagamento (Pix/Conta Corrente/Boleto)
-- e observação, no cadastro de Fornecedores.

ALTER TABLE `suppliers`
  ADD COLUMN `address` varchar(255) NULL,
  ADD COLUMN `cnpj` varchar(20) NULL,
  ADD COLUMN `paymentType` enum('pix','conta_corrente','boleto') NULL,
  ADD COLUMN `pixKey` varchar(150) NULL,
  ADD COLUMN `bankName` varchar(100) NULL,
  ADD COLUMN `bankAgency` varchar(20) NULL,
  ADD COLUMN `bankAccount` varchar(30) NULL,
  ADD COLUMN `notes` text NULL;
