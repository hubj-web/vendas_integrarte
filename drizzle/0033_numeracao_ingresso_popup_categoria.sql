-- Numeração sequencial de ingresso (por evento, mínimo 3 dígitos na exibição)
ALTER TABLE `orders`
  ADD COLUMN `ticketNumber` int NULL;

-- Pop-up de aviso configurável por categoria
ALTER TABLE `product_categories`
  ADD COLUMN `popupEnabled` boolean NOT NULL DEFAULT false,
  ADD COLUMN `popupMessage` text NULL;
