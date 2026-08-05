-- Controle de faltas, status de matrícula (ativo/desistente) e faixa etária por modalidade

ALTER TABLE `modalidades`
  ADD COLUMN `idadeMinima` int,
  ADD COLUMN `idadeMaxima` int;

ALTER TABLE `alunos`
  ADD COLUMN `statusMatricula` enum('ativo','desistente') NOT NULL DEFAULT 'ativo',
  ADD COLUMN `dataDesistencia` timestamp NULL,
  ADD COLUMN `motivoDesistencia` text;

CREATE TABLE `frequencia` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `alunoId` int NOT NULL,
  `data` timestamp NOT NULL,
  `tipo` enum('teorico','pratico') NOT NULL DEFAULT 'teorico',
  `modalidadeId` int,
  `presente` boolean NOT NULL,
  `justificada` boolean NOT NULL DEFAULT false,
  `justificativa` text,
  `observacoes` text,
  `registradoPor` int,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- Ajusta as modalidades já cadastradas com a faixa etária correta
UPDATE `modalidades` SET `idadeMinima` = 12 WHERE `nome` IN ('Canto', 'Violão', 'Dança', 'Teatro');

-- Nova modalidade para crianças de 4 a 11 anos
INSERT INTO `modalidades` (`nome`, `grupoExclusivo`, `valorMensal`, `idadeMinima`, `idadeMaxima`) VALUES
  ('Iniciação à Expressão Artística', false, 50.00, 4, 11);
