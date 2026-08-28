-- Adiciona Cartão e Débito como formas de pagamento manuais pro vendedor
-- (ele usa a própria maquininha por fora, e só registra qual foi usada).

ALTER TABLE `orders`
  MODIFY COLUMN `paymentMethod` enum('cash','pix','credit_card','debit_card') NOT NULL;

ALTER TABLE `payment_methods`
  MODIFY COLUMN `code` enum('pix_loja','cartao_loja','dinheiro_vendedor','pix_vendedor','cartao_vendedor','debito_vendedor') NOT NULL;

INSERT INTO `payment_methods` (`code`, `name`, `description`, `active`) VALUES
  ('cartao_vendedor', 'Cartão de Crédito (Vendedor)', 'Pago na maquininha do vendedor por fora do sistema — só registra qual foi usada', true),
  ('debito_vendedor', 'Cartão de Débito (Vendedor)', 'Pago na maquininha do vendedor por fora do sistema — só registra qual foi usada', true);
