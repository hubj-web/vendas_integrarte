-- O upload de imagem (categoria/produto/evento) estava tentando usar um
-- serviço de storage externo (Forge/S3) que só existe na plataforma original
-- do projeto — não está disponível rodando no Railway. A partir de agora as
-- imagens são salvas direto no banco (como base64), então precisam de mais
-- espaço que o tipo `text` permite (64KB) — trocando pra `longtext`.

ALTER TABLE `product_categories` MODIFY COLUMN `imageUrl` longtext;
ALTER TABLE `products` MODIFY COLUMN `imageUrl` longtext;
ALTER TABLE `store_events` MODIFY COLUMN `imageUrl` longtext;
