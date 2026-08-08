import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  tinyint,
} from "drizzle-orm/mysql-core";

// ─── USERS ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name").notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: mysqlEnum("role", ["admin", "launcher", "delivery"]).default("launcher").notNull(),
  roles: varchar("roles", { length: 255 }).default("[\"launcher\"]").notNull(),
  loginMethod: varchar("loginMethod", { length: 64 }).default("local"),
  active: boolean("active").default(true).notNull(),
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
  resetToken: varchar("resetToken", { length: 128 }),
  resetTokenExpiresAt: timestamp("resetTokenExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── PRODUCT CATEGORIES ─────────────────────────────────────────────────────────────────
export const productCategories = mysqlTable("product_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  imageUrl: text("imageUrl"),
  sortOrder: int("sortOrder").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductCategory = typeof productCategories.$inferSelect;

// ─── PRODUCT TYPES (legacy intermediary, kept for backward compat) ───────────
export const productTypes = mysqlTable("product_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  categoryId: int("categoryId"),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductType = typeof productTypes.$inferSelect;

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  contactName: varchar("contactName", { length: 150 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 150 }).default(''),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  categoryId: int("categoryId"),
  productTypeId: int("productTypeId").notNull(),
  supplierId: int("supplierId"), // Relacionamento com fornecedor
  unit: varchar("unit", { length: 50 }).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }).default("0.00").notNull(),
  description: text("description"),
  maxFlavors: int("maxFlavors").default(0), // 0 = sem sabores, >0 = quantidade máxima de sabores
  // Rótulo da variação (o que o campo "sabores" representa pra esse produto).
  // Aditivo — todo produto já existente assume 'sabor' (comportamento atual preservado).
  variationType: mysqlEnum("variationType", ["sabor", "tamanho", "cor"]).default("sabor").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;

// ─── PRODUCT FLAVORS (sabores disponíveis por produto) ────────────────────────
export const productFlavors = mysqlTable("product_flavors", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  additionalPrice: decimal("additionalPrice", { precision: 10, scale: 2 }).default("0.00"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductFlavor = typeof productFlavors.$inferSelect;

export const productChangeHistory = mysqlTable("product_change_history", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  userId: int("userId").notNull(),
  field: varchar("field", { length: 100 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
});

// ─── MINIPIZZA TYPES (legacy - kept for old orders) ──────────────────────────
export const minipizzaTypes = mysqlTable("minipizza_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  units: int("units").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }).default("0.00").notNull(),
  supplierId: int("supplierId"), // Relacionamento com fornecedor
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MinipizzaType = typeof minipizzaTypes.$inferSelect;

// ─── MINIPIZZA FLAVORS (legacy) ──────────────────────────────────────────────
export const minipizzaFlavors = mysqlTable("minipizza_flavors", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  additionalPrice: decimal("additionalPrice", { precision: 10, scale: 2 }).default("0.00"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MinipizzaFlavor = typeof minipizzaFlavors.$inferSelect;

// ─── MINIPIZZA TYPE × FLAVOR COMPATIBILITY (legacy) ──────────────────────────
export const minipizzaTypeFlavorMatrix = mysqlTable("minipizza_type_flavor_matrix", {
  id: int("id").autoincrement().primaryKey(),
  minipizzaTypeId: int("minipizzaTypeId").notNull(),
  minipizzaFlavorId: int("minipizzaFlavorId").notNull(),
  active: boolean("active").default(true).notNull(),
});

// ─── JELLY FLAVORS (legacy) ──────────────────────────────────────────────────
export const jellyFlavors = mysqlTable("jelly_flavors", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }).default("0.00").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type JellyFlavor = typeof jellyFlavors.$inferSelect;

// ─── DELIVERY METHODS ─────────────────────────────────────────────────────────
export const deliveryMethods = mysqlTable("delivery_methods", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  requiresAddress: boolean("requiresAddress").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeliveryMethod = typeof deliveryMethods.$inferSelect;

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  locationReference: text("locationReference"),
  customerReference: varchar("customerReference", { length: 200 }),
  street: varchar("street", { length: 200 }),
  number: varchar("number", { length: 20 }),
  complement: varchar("complement", { length: 100 }),
  neighborhood: varchar("neighborhood", { length: 100 }),
  city: varchar("city", { length: 100 }),
  zipCode: varchar("zipCode", { length: 10 }),
  isInternal: boolean("isInternal").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;

// ─── ORDERS ───────────────────────────────────────────────────────────────────
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  launcherId: int("launcherId").notNull(),
  deliveryMethodId: int("deliveryMethodId").notNull(),
  deliveryDate: timestamp("deliveryDate"),
  deliveryAddress: text("deliveryAddress"),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "pix", "credit_card"]).notNull(),
  // Origem do pedido: 'periodo' = fluxo normal (vendedor, período de vendas),
  // 'loja_publica' = comprado pelo cliente direto na loja on-line (sem login).
  // Aditivo — todo pedido antigo/existente fica com o default 'periodo'.
  channel: mysqlEnum("channel", ["periodo", "loja_publica"]).default("periodo").notNull(),
  status: mysqlEnum("status", ["production", "in_route", "packaged", "delivered", "paid", "cancelled"]).default("production").notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "partial", "cancelled"]).default("pending").notNull(),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  cancelReason: text("cancelReason"),
  cancelledBy: int("cancelledBy"),
  cancelledAt: timestamp("cancelledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;

// ─── ORDER ITEMS ─────────────────────────────────────────────────────────────
export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  productId: int("productId").notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
});

// ─── ORDER ITEM FLAVORS (sabores escolhidos por item do pedido) ──────────────
export const orderItemFlavors = mysqlTable("order_item_flavors", {
  id: int("id").autoincrement().primaryKey(),
  orderItemId: int("orderItemId").notNull(),
  productFlavorId: int("productFlavorId").notNull(),
  flavorName: varchar("flavorName", { length: 100 }).notNull(), // denormalized for history
});

// ─── ORDER MINIPIZZAS (legacy - kept for old orders) ─────────────────────────
export const orderMinipizzas = mysqlTable("order_minipizzas", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  minipizzaTypeId: int("minipizzaTypeId").notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
});

// ─── ORDER MINIPIZZA FLAVORS (legacy) ────────────────────────────────────────
export const orderMinipizzaFlavors = mysqlTable("order_minipizza_flavors", {
  id: int("id").autoincrement().primaryKey(),
  orderMinipizzaId: int("orderMinipizzaId").notNull(),
  minipizzaFlavorId: int("minipizzaFlavorId").notNull(),
});

// ─── ORDER JELLIES (legacy) ──────────────────────────────────────────────────
export const orderJellies = mysqlTable("order_jellies", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  jellyFlavorId: int("jellyFlavorId").notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
});

// ─── ORDER STATUS HISTORY ─────────────────────────────────────────────────────
export const orderStatusHistory = mysqlTable("order_status_history", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  userId: int("userId").notNull(),
  fromStatus: varchar("fromStatus", { length: 50 }),
  toStatus: varchar("toStatus", { length: 50 }).notNull(),
  notes: text("notes"),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
});

// ─── DELIVERY ROUTES ──────────────────────────────────────────────────────────
export const deliveryRoutes = mysqlTable("delivery_routes", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  deliveryDate: timestamp("deliveryDate").notNull(),
  deliveryUserId: int("deliveryUserId").notNull(),
  startingAddress: text("startingAddress"),
  totalDistance: decimal("totalDistance", { precision: 10, scale: 2 }).default("0.00"),
  status: mysqlEnum("status", ["planned", "in_progress", "completed"]).default("planned").notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeliveryRoute = typeof deliveryRoutes.$inferSelect;

// ─── ROUTE ORDERS ─────────────────────────────────────────────────────────────
export const routeOrders = mysqlTable("route_orders", {
  id: int("id").autoincrement().primaryKey(),
  routeId: int("routeId").notNull(),
  orderId: int("orderId").notNull(),
  position: int("position").notNull(),
  distanceFromPrevious: decimal("distanceFromPrevious", { precision: 10, scale: 2 }).default("0.00"),
});

// ─── DELIVERY RECORDS ─────────────────────────────────────────────────────────
export const deliveryRecords = mysqlTable("delivery_records", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().unique(),
  deliveryUserId: int("deliveryUserId").notNull(),
  deliveredAt: timestamp("deliveredAt").notNull(),
  notes: text("notes"),
  proofImageUrl: text("proofImageUrl"),
  proofImageKey: varchar("proofImageKey", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── PAYMENT RECORDS ──────────────────────────────────────────────────────────
export const paymentRecords = mysqlTable("payment_records", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "pix"]).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paidAt: timestamp("paidAt").notNull(),
  notes: text("notes"),
  proofImageUrl: text("proofImageUrl"),
  proofImageKey: varchar("proofImageKey", { length: 500 }),
  registeredBy: int("registeredBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ══════════════════════════════════════════════════════════════════════════════
// ─── GESTÃO INTEGRARTE — Escola de Artes Espírita ─────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// Modalidades (Canto, Violão, Dança, Teatro, ...) — catálogo editável.
// "grupoExclusivo" marca as modalidades que competem entre si (aluno só pode
// escolher UMA desse grupo — hoje são Canto/Violão/Dança); as demais (ex:
// Teatro) podem ser combinadas livremente com uma do grupo exclusivo.
export const modalidades = mysqlTable("modalidades", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull().unique(),
  grupoExclusivo: boolean("grupoExclusivo").default(false).notNull(),
  valorMensal: decimal("valorMensal", { precision: 10, scale: 2 }).notNull().default("50.00"),
  idadeMinima: int("idadeMinima"), // ex: Canto/Violão/Teatro/Dança = 12; Iniciação = 4
  idadeMaxima: int("idadeMaxima"), // ex: Iniciação à Expressão Artística = 11 (sem máximo = null)
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const alunos = mysqlTable("alunos", {
  id: int("id").autoincrement().primaryKey(),
  nomeCompleto: varchar("nomeCompleto", { length: 200 }).notNull(),
  dataNascimento: timestamp("dataNascimento"),
  cpf: varchar("cpf", { length: 14 }),
  email: varchar("email", { length: 255 }),
  telefone: varchar("telefone", { length: 20 }),
  maiorIdade: boolean("maiorIdade").notNull().default(true),
  responsavelNome: varchar("responsavelNome", { length: 200 }),
  responsavelVinculo: varchar("responsavelVinculo", { length: 100 }),
  responsavelEmail: varchar("responsavelEmail", { length: 255 }),
  responsavelTelefone: varchar("responsavelTelefone", { length: 20 }),
  responsavelPresenteMenor10: boolean("responsavelPresenteMenor10"),
  autorizacaoImagem: boolean("autorizacaoImagem").default(false).notNull(),
  possuiDeficiencia: boolean("possuiDeficiencia").default(false).notNull(),
  deficienciaQual: text("deficienciaQual"),
  dataMatricula: timestamp("dataMatricula").defaultNow().notNull(),
  // Status da matrícula: aluno que desiste no meio do ano só pode voltar no
  // próximo período de matrículas — guardamos a data pra saber quando isso libera.
  statusMatricula: mysqlEnum("statusMatricula", ["ativo", "desistente"]).default("ativo").notNull(),
  dataDesistencia: timestamp("dataDesistencia"),
  motivoDesistencia: text("motivoDesistencia"),
  active: boolean("active").default(true).notNull(),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Controle de frequência — aula teórica de sábado (obrigatória p/ todas as
// modalidades) e/ou aula prática de uma modalidade específica. Falta no
// teórico conta como falta integral (todas as modalidades daquele dia).
export const frequencia = mysqlTable("frequencia", {
  id: int("id").autoincrement().primaryKey(),
  alunoId: int("alunoId").notNull(),
  data: timestamp("data").notNull(),
  tipo: mysqlEnum("tipo", ["teorico", "pratico"]).default("teorico").notNull(),
  modalidadeId: int("modalidadeId"), // preenchido só quando tipo = "pratico"
  presente: boolean("presente").notNull(),
  justificada: boolean("justificada").default(false).notNull(),
  justificativa: text("justificativa"),
  observacoes: text("observacoes"),
  registradoPor: int("registradoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});


export const alunoModalidades = mysqlTable("aluno_modalidades", {
  id: int("id").autoincrement().primaryKey(),
  alunoId: int("alunoId").notNull(),
  modalidadeId: int("modalidadeId").notNull(),
  dataInicio: timestamp("dataInicio").defaultNow().notNull(),
  active: boolean("active").default(true).notNull(),
});

export const professores = mysqlTable("professores", {
  id: int("id").autoincrement().primaryKey(),
  nomeCompleto: varchar("nomeCompleto", { length: 200 }).notNull(),
  cpf: varchar("cpf", { length: 14 }),
  email: varchar("email", { length: 255 }),
  telefone: varchar("telefone", { length: 20 }),
  valorBolsaMensal: decimal("valorBolsaMensal", { precision: 10, scale: 2 }).notNull().default("0.00"),
  chavePix: varchar("chavePix", { length: 255 }),
  dataInicio: timestamp("dataInicio").defaultNow().notNull(),
  active: boolean("active").default(true).notNull(),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Vínculo professor ↔ modalidade (um professor pode lecionar mais de uma)
export const professorModalidades = mysqlTable("professor_modalidades", {
  id: int("id").autoincrement().primaryKey(),
  professorId: int("professorId").notNull(),
  modalidadeId: int("modalidadeId").notNull(),
});

// Controle mensal da contribuição de custeio dos alunos
export const pagamentosAlunos = mysqlTable("pagamentos_alunos", {
  id: int("id").autoincrement().primaryKey(),
  alunoId: int("alunoId").notNull(),
  mesReferencia: varchar("mesReferencia", { length: 7 }).notNull(), // "2026-08"
  valorEsperado: decimal("valorEsperado", { precision: 10, scale: 2 }).notNull(),
  valorPago: decimal("valorPago", { precision: 10, scale: 2 }),
  dataPagamento: timestamp("dataPagamento"),
  formaPagamento: mysqlEnum("formaPagamento", ["pix", "dinheiro", "transferencia", "outro"]),
  status: mysqlEnum("status", ["pendente", "pago", "atrasado", "isento"]).default("pendente").notNull(),
  observacoes: text("observacoes"),
  registradoPor: int("registradoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Controle mensal da bolsa cultura dos professores
export const pagamentosProfessores = mysqlTable("pagamentos_professores", {
  id: int("id").autoincrement().primaryKey(),
  professorId: int("professorId").notNull(),
  mesReferencia: varchar("mesReferencia", { length: 7 }).notNull(),
  valorEsperado: decimal("valorEsperado", { precision: 10, scale: 2 }).notNull(),
  valorPago: decimal("valorPago", { precision: 10, scale: 2 }),
  dataPagamento: timestamp("dataPagamento"),
  formaPagamento: mysqlEnum("formaPagamento", ["pix", "dinheiro", "transferencia", "outro"]),
  status: mysqlEnum("status", ["pendente", "pago", "atrasado"]).default("pendente").notNull(),
  observacoes: text("observacoes"),
  registradoPor: int("registradoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ══════════════════════════════════════════════════════════════════════════════
// ─── PERÍODOS DE VENDA — controla quando os vendedores podem lançar pedido
// normal (produção nova) vs. só vender o que já está no Integrarte Estoque ───
// ══════════════════════════════════════════════════════════════════════════════
export const periodosVenda = mysqlTable("periodos_venda", {
  id: int("id").autoincrement().primaryKey(),
  descricao: varchar("descricao", { length: 200 }),
  dataAbertura: timestamp("dataAbertura").notNull(),
  dataFechamento: timestamp("dataFechamento").notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ══════════════════════════════════════════════════════════════════════════════
// ─── ESTOQUE INTEGRARTE — substitui o "cliente fake" por um estoque de verdade
// ══════════════════════════════════════════════════════════════════════════════

// Nível atual de estoque — uma linha por combinação de produto+sabores.
export const estoqueAtual = mysqlTable("estoque_atual", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  quantidade: int("quantidade").notNull().default(0),
  custoMedioUnitario: decimal("custoMedioUnitario", { precision: 10, scale: 2 }).notNull().default("0.00"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const estoqueAtualFlavors = mysqlTable("estoque_atual_flavors", {
  id: int("id").autoincrement().primaryKey(),
  estoqueAtualId: int("estoqueAtualId").notNull(),
  productFlavorId: int("productFlavorId").notNull(),
  flavorName: varchar("flavorName", { length: 100 }).notNull(),
});

// Pedido de Estoque — a "lista de compras" enviada ao fornecedor, com fluxo
// Rascunho → Enviado → Recebido. Ao marcar como Recebido, dá entrada automática
// no estoque_atual e o custo entra nos relatórios financeiros.
export const pedidosEstoque = mysqlTable("pedidos_estoque", {
  id: int("id").autoincrement().primaryKey(),
  fornecedorId: int("fornecedorId").notNull(),
  descricao: varchar("descricao", { length: 200 }),
  status: mysqlEnum("status", ["rascunho", "enviado", "recebido", "cancelado"]).default("rascunho").notNull(),
  dataEnvio: timestamp("dataEnvio"),
  dataRecebimento: timestamp("dataRecebimento"),
  observacoes: text("observacoes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const pedidosEstoqueItens = mysqlTable("pedidos_estoque_itens", {
  id: int("id").autoincrement().primaryKey(),
  pedidoEstoqueId: int("pedidoEstoqueId").notNull(),
  productId: int("productId").notNull(),
  quantidade: int("quantidade").notNull(),
  custoUnitario: decimal("custoUnitario", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const pedidosEstoqueItemFlavors = mysqlTable("pedidos_estoque_item_flavors", {
  id: int("id").autoincrement().primaryKey(),
  pedidoEstoqueItemId: int("pedidoEstoqueItemId").notNull(),
  productFlavorId: int("productFlavorId").notNull(),
  flavorName: varchar("flavorName", { length: 100 }).notNull(),
});

// ══════════════════════════════════════════════════════════════════════════════
// ─── LOJA PÚBLICA — venda on-line sem login, exclusivamente do Estoque ────────
// ══════════════════════════════════════════════════════════════════════════════

// Configuração única da loja (uma linha só). Controla se está aberta e uma
// mensagem opcional exibida quando fechada.
export const storeSettings = mysqlTable("store_settings", {
  id: int("id").autoincrement().primaryKey(),
  isOpen: boolean("isOpen").default(false).notNull(),
  closedMessage: text("closedMessage"),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Curadoria: quais produtos do Estoque aparecem na loja pública, e a que
// preço (pode divergir do preço do produto usado no período de vendas).
// Se um produto não tem linha aqui, NÃO aparece na loja (opt-in explícito).
export const storeProductVisibility = mysqlTable("store_product_visibility", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().unique(),
  visible: boolean("visible").default(true).notNull(),
  storePrice: decimal("storePrice", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Dados do pagamento on-line (Mercado Pago) de um pedido da loja pública.
// Separado de payment_records de propósito: payment_records é o registro
// MANUAL feito pelo vendedor (dinheiro/pix combinado); aqui é o rastro do
// pagamento automático via Mercado Pago (PIX ou cartão), com webhook.
export const storeOrderPayments = mysqlTable("store_order_payments", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().unique(),
  method: mysqlEnum("method", ["pix", "credit_card"]).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled", "expired"]).default("pending").notNull(),
  mpPaymentId: varchar("mpPaymentId", { length: 100 }),
  mpPreferenceId: varchar("mpPreferenceId", { length: 100 }),
  qrCode: text("qrCode"),
  qrCodeBase64: text("qrCodeBase64"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  expiresAt: timestamp("expiresAt"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StoreOrderPayment = typeof storeOrderPayments.$inferSelect;
export type StoreProductVisibility = typeof storeProductVisibility.$inferSelect;
