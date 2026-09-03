-- E-mail opcional do cliente, pra poder mandar o recibo da compra da Loja
-- Pública por e-mail (reaproveitando o mesmo serviço já usado pra e-mail de
-- boas-vindas/redefinição de senha de usuário).

ALTER TABLE `customers`
  ADD COLUMN `email` varchar(255) NULL;
