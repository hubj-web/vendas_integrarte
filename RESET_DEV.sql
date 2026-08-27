-- ⚠️ RODAR SÓ NO BANCO DE DEV — nunca em produção.
-- Limpa TODOS os dados de venda/loja/estoque, preservando:
--   - tabela `users` (seu login continua funcionando)
--   - tabelas do módulo de Gestão (alunos, professores, modalidades — fora do escopo)

-- Pedidos e tudo que depende deles
DELETE FROM `order_item_variation_selections`;
DELETE FROM `order_item_flavors`;
DELETE FROM `order_minipizza_flavors`;
DELETE FROM `order_minipizzas`;
DELETE FROM `order_jellies`;
DELETE FROM `order_items`;
DELETE FROM `payment_records`;
DELETE FROM `delivery_records`;
DELETE FROM `route_orders`;
DELETE FROM `delivery_routes`;
DELETE FROM `order_status_history`;
DELETE FROM `store_order_payments`;
DELETE FROM `orders`;
DELETE FROM `customers`;

-- Estoque
DELETE FROM `estoque_atual_flavors`;
DELETE FROM `estoque_atual`;
DELETE FROM `pedidos_estoque_item_flavors`;
DELETE FROM `pedidos_estoque_itens`;
DELETE FROM `pedidos_estoque`;

-- Loja Pública (eventos, visibilidade, configuração)
DELETE FROM `store_event_categories`;
DELETE FROM `store_regular_category_visibility`;
DELETE FROM `store_delivery_method_visibility`;
DELETE FROM `store_product_visibility`;
DELETE FROM `store_events`;
DELETE FROM `store_settings`;

-- Catálogo (produtos, categorias, variações)
DELETE FROM `product_variation_options`;
DELETE FROM `product_variation_groups`;
DELETE FROM `product_flavors`;
DELETE FROM `minipizza_type_flavor_matrix`;
DELETE FROM `minipizza_flavors`;
DELETE FROM `minipizza_types`;
DELETE FROM `jelly_flavors`;
DELETE FROM `product_change_history`;
DELETE FROM `products`;
DELETE FROM `product_categories`;
DELETE FROM `product_types`;
DELETE FROM `suppliers`;

-- Configuração geral
DELETE FROM `delivery_methods`;
DELETE FROM `periodos_venda`;
DELETE FROM `activity_log`;

-- Reinicia a contagem de IDs, pra os primeiros cadastros novos começarem do 1
ALTER TABLE `orders` AUTO_INCREMENT = 1;
ALTER TABLE `customers` AUTO_INCREMENT = 1;
ALTER TABLE `products` AUTO_INCREMENT = 1;
ALTER TABLE `product_categories` AUTO_INCREMENT = 1;
ALTER TABLE `product_types` AUTO_INCREMENT = 1;
ALTER TABLE `estoque_atual` AUTO_INCREMENT = 1;
ALTER TABLE `store_events` AUTO_INCREMENT = 1;
ALTER TABLE `delivery_methods` AUTO_INCREMENT = 1;
ALTER TABLE `periodos_venda` AUTO_INCREMENT = 1;
ALTER TABLE `pedidos_estoque` AUTO_INCREMENT = 1;
ALTER TABLE `activity_log` AUTO_INCREMENT = 1;
