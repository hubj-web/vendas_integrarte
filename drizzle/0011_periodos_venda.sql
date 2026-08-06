-- Períodos de venda: controla quando os vendedores podem lançar pedido normal
-- vs. só vender o que já está no Integrarte Estoque

CREATE TABLE `periodos_venda` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `descricao` varchar(200),
  `dataAbertura` timestamp NOT NULL,
  `dataFechamento` timestamp NOT NULL,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);
