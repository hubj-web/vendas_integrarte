-- Gestão Integrarte — Escola de Artes Espírita: alunos, professores, modalidades e pagamentos

CREATE TABLE `modalidades` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `nome` varchar(100) NOT NULL,
  `grupoExclusivo` boolean NOT NULL DEFAULT false,
  `valorMensal` decimal(10,2) NOT NULL DEFAULT '50.00',
  `active` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `modalidades_nome_unique` UNIQUE(`nome`)
);

CREATE TABLE `alunos` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `nomeCompleto` varchar(200) NOT NULL,
  `dataNascimento` timestamp NULL,
  `cpf` varchar(14),
  `email` varchar(255),
  `telefone` varchar(20),
  `maiorIdade` boolean NOT NULL DEFAULT true,
  `responsavelNome` varchar(200),
  `responsavelVinculo` varchar(100),
  `responsavelEmail` varchar(255),
  `responsavelTelefone` varchar(20),
  `responsavelPresenteMenor10` boolean,
  `autorizacaoImagem` boolean NOT NULL DEFAULT false,
  `possuiDeficiencia` boolean NOT NULL DEFAULT false,
  `deficienciaQual` text,
  `dataMatricula` timestamp NOT NULL DEFAULT (now()),
  `active` boolean NOT NULL DEFAULT true,
  `observacoes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `aluno_modalidades` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `alunoId` int NOT NULL,
  `modalidadeId` int NOT NULL,
  `dataInicio` timestamp NOT NULL DEFAULT (now()),
  `active` boolean NOT NULL DEFAULT true
);

CREATE TABLE `professores` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `nomeCompleto` varchar(200) NOT NULL,
  `cpf` varchar(14),
  `email` varchar(255),
  `telefone` varchar(20),
  `valorBolsaMensal` decimal(10,2) NOT NULL DEFAULT '0.00',
  `chavePix` varchar(255),
  `dataInicio` timestamp NOT NULL DEFAULT (now()),
  `active` boolean NOT NULL DEFAULT true,
  `observacoes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `professor_modalidades` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `professorId` int NOT NULL,
  `modalidadeId` int NOT NULL
);

CREATE TABLE `pagamentos_alunos` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `alunoId` int NOT NULL,
  `mesReferencia` varchar(7) NOT NULL,
  `valorEsperado` decimal(10,2) NOT NULL,
  `valorPago` decimal(10,2),
  `dataPagamento` timestamp NULL,
  `formaPagamento` enum('pix','dinheiro','transferencia','outro'),
  `status` enum('pendente','pago','atrasado','isento') NOT NULL DEFAULT 'pendente',
  `observacoes` text,
  `registradoPor` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `pagamentos_professores` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `professorId` int NOT NULL,
  `mesReferencia` varchar(7) NOT NULL,
  `valorEsperado` decimal(10,2) NOT NULL,
  `valorPago` decimal(10,2),
  `dataPagamento` timestamp NULL,
  `formaPagamento` enum('pix','dinheiro','transferencia','outro'),
  `status` enum('pendente','pago','atrasado') NOT NULL DEFAULT 'pendente',
  `observacoes` text,
  `registradoPor` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

-- Modalidades iniciais, conforme o formulário de matrícula em uso
INSERT INTO `modalidades` (`nome`, `grupoExclusivo`, `valorMensal`) VALUES
  ('Canto', true, 50.00),
  ('Violão', true, 50.00),
  ('Dança', true, 50.00),
  ('Teatro', false, 50.00);
