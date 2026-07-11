-- Migration 0007: Adicionar flag "cliente interno" (pedidos de estoque, não são vendas reais)
-- Pedidos de clientes internos continuam contando no Relatório de Produção,
-- mas são excluídos do faturamento nos Relatórios de Vendas e no Dashboard.

ALTER TABLE `customers` ADD COLUMN `isInternal` boolean NOT NULL DEFAULT false;
