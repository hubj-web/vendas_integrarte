-- Item 5 (lote/validade) e item 3 (auditoria) do plano de melhorias.
-- Tudo aditivo e opcional — quem não usar lote/validade continua com o
-- comportamento exatamente igual a hoje (desconta pelo mais antigo).

ALTER TABLE `estoque_atual`
  ADD COLUMN `lote` varchar(50),
  ADD COLUMN `validade` timestamp NULL,
  ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());

CREATE TABLE `activity_log` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `userId` int,
  `userName` varchar(100),
  `action` varchar(100) NOT NULL,
  `entityType` varchar(50),
  `entityId` int,
  `description` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);
