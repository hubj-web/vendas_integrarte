-- Permite destacar categorias/produtos com tamanhos diferentes na Loja
-- Pública (Pequeno/Médio/Grande). Aditivo, default 'medio' preserva o
-- tamanho atual pra tudo que já existe.

ALTER TABLE `product_categories`
  ADD COLUMN `displaySize` enum('pequeno','medio','grande') NOT NULL DEFAULT 'medio';

ALTER TABLE `products`
  ADD COLUMN `displaySize` enum('pequeno','medio','grande') NOT NULL DEFAULT 'medio';
