-- Eventos da Loja — permite ter, além da Venda Regular (que continua igual,
-- controlada por store_settings), eventos específicos como bailes e festas,
-- cada um com suas próprias categorias habilitadas (ingressos, produtos, etc).
-- Tudo aditivo.

ALTER TABLE `orders`
  ADD COLUMN `eventId` int,
  ADD COLUMN `ticketCode` varchar(20),
  MODIFY COLUMN `channel` enum('periodo','loja_publica','vendedor_evento') NOT NULL DEFAULT 'periodo';

CREATE TABLE `store_events` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `name` varchar(150) NOT NULL,
  `type` enum('ingresso','produtos') NOT NULL DEFAULT 'produtos',
  `description` text,
  `imageUrl` text,
  `isOpen` boolean NOT NULL DEFAULT false,
  `eventDate` timestamp NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `store_event_categories` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `eventId` int NOT NULL,
  `categoryId` int NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0
);
