-- Corrige acentuação que se perdeu ao colar os textos originais no console
-- MySQL (problema de encoding do terminal, não do sistema).

UPDATE `payment_methods` SET
  `name` = 'PIX (Loja Pública)',
  `description` = 'QR code estático direto pro CNPJ da instituição — confirmação manual'
WHERE `code` = 'pix_loja';

UPDATE `payment_methods` SET
  `name` = 'Cartão de Crédito/Débito (Loja Pública)',
  `description` = 'Via Mercado Pago (Payment Brick) — aceita crédito e débito'
WHERE `code` = 'cartao_loja';

UPDATE `payment_methods` SET
  `name` = 'Dinheiro (Vendedor)',
  `description` = 'Pagamento combinado direto com o cliente, lançado pelo vendedor'
WHERE `code` = 'dinheiro_vendedor';

UPDATE `payment_methods` SET
  `name` = 'PIX (Vendedor)',
  `description` = 'Pagamento combinado direto com o cliente, lançado pelo vendedor'
WHERE `code` = 'pix_vendedor';

UPDATE `users` SET `name` = 'Loja Pública (sistema)' WHERE `email` = 'loja-publica@sistema.integrarte.local';
