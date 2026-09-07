-- Status "Recusado" pro pagamento do pedido — antes, um cartão recusado
-- ficava marcado igual a "Pendente" (sem diferenciar de um PIX ainda não
-- pago), o que confundia no CRM.

ALTER TABLE `orders`
  MODIFY COLUMN `paymentStatus` enum('pending','paid','partial','rejected','cancelled') NOT NULL DEFAULT 'pending';
