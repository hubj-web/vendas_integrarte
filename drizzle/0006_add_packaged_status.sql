-- Migration 0006: Adicionar status 'packaged' (empacotado) ao fluxo de pedidos
-- Novo fluxo: production -> in_route -> packaged -> delivered -> paid

ALTER TABLE `orders` MODIFY COLUMN `status` enum('production','in_route','packaged','delivered','paid','cancelled') NOT NULL DEFAULT 'production';
