-- Migration 0005: Adicionar campo de referência do cliente (origem do cliente)

ALTER TABLE `customers` ADD COLUMN `customerReference` varchar(200);
