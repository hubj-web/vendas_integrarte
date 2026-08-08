-- Loja Pública, fase 2: categorias com imagem e produtos com tipo de variação
-- genérico (sabor/tamanho/cor). Tudo aditivo — nenhum dado ou comportamento
-- existente é alterado; produtos já cadastrados continuam funcionando
-- exatamente como "sabor" (era o único tipo que existia até aqui).

ALTER TABLE `product_categories` ADD COLUMN `imageUrl` text;

ALTER TABLE `products`
  ADD COLUMN `variationType` enum('sabor','tamanho','cor') NOT NULL DEFAULT 'sabor';
