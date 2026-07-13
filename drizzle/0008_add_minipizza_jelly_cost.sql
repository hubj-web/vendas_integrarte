-- Migration 0008: Adicionar campo de custo em minipizza_types e jelly_flavors
-- Necessário para calcular Custo/Lucro no Relatório Financeiro (antes só existia
-- custo cadastrado para produtos comuns, faltando para minipizzas e geleias).

ALTER TABLE `minipizza_types` ADD COLUMN `cost` decimal(10,2) NOT NULL DEFAULT '0.00';
ALTER TABLE `jelly_flavors` ADD COLUMN `cost` decimal(10,2) NOT NULL DEFAULT '0.00';
