-- Botão flutuante de WhatsApp na Loja Pública, com número configurável pelo CRM.

ALTER TABLE `store_settings`
  ADD COLUMN `whatsappNumber` varchar(20) NULL;
