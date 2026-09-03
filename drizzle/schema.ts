import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  longtext,
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
  imageUrl: longtext("imageUrl"),
  // Tamanho de destaque na Loja Pública — permite deixar uma categoria maior
  // que outra na grade (ex: destacar uma categoria de evento).
  displaySize: mysqlEnum("displaySize", ["pequeno", "medio", "grande"]).default("medio").notNull(),
  // Janela de disponibilidade na Loja Pública (opcional, com data E hora) —
  // fora dela, a categoria (e os produtos dela) não aparecem, mesmo que
  // estejam tudo certo por dentro. Sem preencher, sempre disponível (como
  // hoje). Ex: categoria "Sobremesas" só libera às 19h no dia do evento.
  availableFrom: timestamp("availableFrom"),
  availableUntil: timestamp("availableUntil"),
  // Pop-up de aviso ao entrar na categoria (opcional) — só aparece se ligado
  // E com uma mensagem preenchida.
  popupEnabled: boolean("popupEnabled").default(false).notNull(),
  popupMessage: text("popupMessage"),
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
  imageUrl: longtext("imageUrl"),
  // Tamanho de destaque na Loja Pública — permite deixar um produto maior
  // que outro na lista (ex: destacar um item específico).
  displaySize: mysqlEnum("displaySize", ["pequeno", "medio", "grande"]).default("medio").notNull(),
  // "Sob encomenda" — quando ligado, este produto pode ser vendido na Loja
  // Pública sem checar estoque, independente do Período de Vendas (esse
  // agora serve só pro vendedor). Se `preOrderUntil` estiver vazio, vale
  // pra sempre (ex: um produto sem controle de estoque nenhum); se tiver
  // data, a partir dali passa a exigir estoque real normalmente (ex: um
  // produto sazonal vendido por encomenda até a data de corte com o
  // fornecedor).
  allowPreOrder: boolean("allowPreOrder").default(false).notNull(),
  preOrderUntil: timestamp("preOrderUntil"),
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
  // Custo de entrega (opcional) — quando > 0, soma no total do pedido da
  // Loja Pública quando o cliente escolhe essa forma de entrega. Aditivo:
  // default 0.00 preserva o comportamento de sempre (sem cobrança extra).
  cost: decimal("cost", { precision: 10, scale: 2 }).default("0.00").notNull(),
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
  email: varchar("email", { length: 255 }), // opcional — usado pra mandar o recibo por e-mail
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
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "pix", "credit_card", "debit_card"]).notNull(),
  // Origem do pedido: 'periodo' = fluxo normal (vendedor, período de vendas),
  // 'loja_publica' = comprado pelo cliente direto na loja on-line (sem login).
  // Aditivo — todo pedido antigo/existente fica com o default 'periodo'.
  channel: mysqlEnum("channel", ["periodo", "loja_publica", "vendedor_evento"]).default("periodo").notNull(),
  // Vincula o pedido a um Evento da Loja (baile, festa, etc.) — null = venda
  // regular (período de vendas) ou compra na Venda Regular da loja pública.
  eventId: int("eventId"),
  // Código único do pedido/ingresso — usado no link/QR code do recibo, tanto
  // pra comprovar um ingresso quanto como identificador do recibo em geral.
  ticketCode: varchar("ticketCode", { length: 20 }),
  // Check-in do ingresso/comprovante na entrada do evento — null = ainda não
  // foi lido. Preenchido = já passou pela leitura (evita reuso do mesmo QR).
  checkedInAt: timestamp("checkedInAt"),
  // Numeração sequencial do ingresso, por evento (001, 002, ...) — só
  // preenchida em pedidos de evento do tipo "ingresso".
  ticketNumber: int("ticketNumber"),
  status: mysqlEnum("status", ["received", "production", "in_route", "packaged", "delivered", "delivery_failed", "paid", "cancelled"]).default("production").notNull(),
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
// ─── PERÍODOS DE VENDA — controla quando os vendedores podem lançar pedido
// normal (produção nova) vs. só vender o que já está no Integrarte Estoque ───
// ══════════════════════════════════════════════════════════════════════════════
export const periodosVenda = mysqlTable("periodos_venda", {
  id: int("id").autoincrement().primaryKey(),
  descricao: varchar("descricao", { length: 200 }),
  dataAbertura: timestamp("dataAbertura").notNull(),
  dataFechamento: timestamp("dataFechamento").notNull(),
  // Opcional — a partir dessa data (ainda dentro do período), só é possível
  // vender o que já está no Estoque Integrarte de verdade. Antes dela (ou se
  // não for preenchida), vale a pré-venda sem checar estoque, como sempre.
  dataCorte: timestamp("dataCorte"),
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
  // Lote/validade são opcionais — quem não preencher continua funcionando
  // exatamente como antes (desconta pelo lote mais antigo, por id).
  lote: varchar("lote", { length: 50 }),
  validade: timestamp("validade"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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
  // Opcionais — quando preenchidas, a loja abre/fecha sozinha nessa janela.
  // O interruptor `isOpen` continua valendo como override manual: desligado,
  // fecha mesmo dentro da janela (exceção); ligado, só abre de fato dentro
  // da janela (se houver uma definida). Sem datas = comportamento de sempre.
  saleStartsAt: timestamp("saleStartsAt"),
  saleEndsAt: timestamp("saleEndsAt"),
  // Aparência da tela inicial da loja — em branco, usa os valores padrão do
  // sistema (definidos no código). Preenchido, sobrescreve.
  storeTitle: varchar("storeTitle", { length: 100 }),
  welcomeMessage: text("welcomeMessage"),
  primaryColor: varchar("primaryColor", { length: 7 }), // hex, ex: #1E4B9C
  // Logo mostrada acima do título na loja — em branco, usa a padrão do sistema.
  logoUrl: longtext("logoUrl"),
  // Tipografia do título e da mensagem de boas-vindas — em branco, usa o
  // padrão do sistema (fonte do app, branco, tamanhos atuais).
  titleFontFamily: varchar("titleFontFamily", { length: 50 }),
  titleFontSize: int("titleFontSize"), // em px
  titleColor: varchar("titleColor", { length: 7 }),
  messageFontFamily: varchar("messageFontFamily", { length: 50 }),
  messageFontSize: int("messageFontSize"), // em px
  messageColor: varchar("messageColor", { length: 7 }),
  // Botão flutuante de WhatsApp na Loja Pública — em branco, o botão não
  // aparece. Formato: só números, com DDI+DDD (ex: 5534999998888).
  whatsappNumber: varchar("whatsappNumber", { length: 20 }),
  // Redes sociais/site da instituição — mostrados no rodapé da loja.
  instagramUrl: varchar("instagramUrl", { length: 255 }),
  websiteUrl: varchar("websiteUrl", { length: 255 }),
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

// ══════════════════════════════════════════════════════════════════════════════
// ─── EVENTOS DA LOJA — bailes, festas, vendas de ingresso ou de produtos ──────
// ══════════════════════════════════════════════════════════════════════════════
// A "Venda Regular" (loja sempre aberta, congelados do mês) NÃO é uma linha
// aqui — continua controlada por `store_settings`, exatamente como já era.
// Esta tabela é só para eventos ADICIONAIS: um baile específico, uma festa
// com venda de ingresso, uma venda de produtos num evento gratuito, etc.
export const storeEvents = mysqlTable("store_events", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  // 'ingresso' = vende acesso/participação no evento (ex: ingresso do baile).
  // 'produtos' = vende produtos no/para o evento, sem ingresso (ex: bebidas no dia).
  type: mysqlEnum("type", ["ingresso", "produtos"]).default("produtos").notNull(),
  description: text("description"), // mensagem de boas-vindas específica do evento
  imageUrl: longtext("imageUrl"), // banner mostrado no card do evento
  isOpen: boolean("isOpen").default(false).notNull(),
  eventDate: timestamp("eventDate"), // data do evento em si (baile, festa...)
  // Janela de venda (diferente da data do evento) — mesma lógica de override
  // do storeSettings: sem datas, comportamento de sempre (só o interruptor).
  saleStartsAt: timestamp("saleStartsAt"),
  saleEndsAt: timestamp("saleEndsAt"),
  sortOrder: int("sortOrder").default(0).notNull(),
  // Código curto (6 dígitos) pra liberar a tela de check-in sem precisar de
  // login — gerado automaticamente na criação do evento, pra compartilhar
  // com voluntários que vão ler os ingressos na entrada.
  checkInCode: varchar("checkInCode", { length: 6 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Quais categorias de produto aparecem dentro de cada evento (N-N — a mesma
// categoria pode pertencer à Venda Regular E a um ou mais eventos).
export const storeEventCategories = mysqlTable("store_event_categories", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  categoryId: int("categoryId").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
});

export type StoreEvent = typeof storeEvents.$inferSelect;

// ══════════════════════════════════════════════════════════════════════════════
// ─── FORMAS DE PAGAMENTO — controla o que aparece em cada lugar ───────────────
// ══════════════════════════════════════════════════════════════════════════════
// Não cria formas de pagamento novas do zero (cada uma tem uma lógica técnica
// própria por trás — PIX estático, Mercado Pago, etc.) — só controla QUAIS das
// que já existem aparecem em cada contexto (Venda Regular, cada Evento).
export const paymentMethods = mysqlTable("payment_methods", {
  id: int("id").autoincrement().primaryKey(),
  code: mysqlEnum("code", ["pix_loja", "cartao_loja", "dinheiro_vendedor", "pix_vendedor", "cartao_vendedor", "debito_vendedor"]).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  active: boolean("active").default(true).notNull(), // interruptor geral — desligado, some de todo lugar
});

// Liga/desliga uma forma de pagamento na Venda Regular especificamente
// (opt-out, mesmo padrão de categorias/entrega — ausência de linha = visível).
export const storeRegularPaymentMethodVisibility = mysqlTable("store_regular_payment_method_visibility", {
  id: int("id").autoincrement().primaryKey(),
  paymentMethodId: int("paymentMethodId").notNull().unique(),
  visible: boolean("visible").default(true).notNull(),
});

// Liga/desliga uma forma de pagamento num Evento específico (opt-out, mesmo
// padrão da Venda Regular — ausência de linha = visível. Assim, eventos já
// existentes continuam com todas as formas ativas funcionando normalmente,
// sem precisar de nenhuma configuração extra).
export const storeEventPaymentMethodVisibility = mysqlTable("store_event_payment_method_visibility", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  paymentMethodId: int("paymentMethodId").notNull(),
  visible: boolean("visible").default(true).notNull(),
});

// ══════════════════════════════════════════════════════════════════════════════
// ─── AUDITORIA — quem mudou o quê ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export const activityLog = mysqlTable("activity_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  userName: varchar("userName", { length: 100 }),
  action: varchar("action", { length: 100 }).notNull(), // ex: "store.setProductVisibility"
  entityType: varchar("entityType", { length: 50 }), // ex: "product", "event"
  entityId: int("entityId"),
  description: text("description").notNull(), // texto pronto pra mostrar na tela
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ══════════════════════════════════════════════════════════════════════════════
// ─── GRUPOS DE VARIAÇÃO — várias escolhas no mesmo produto ────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// Sistema NOVO e independente do "sabor" (productFlavors/maxFlavors) já
// existente — aquele continua funcionando exatamente igual pros produtos que
// já usam. Este é pra quando um produto precisa de VÁRIAS escolhas ao mesmo
// tempo (ex: marmitex de macarrão → tipo de macarrão + tipo de molho +
// condimentos). Um produto só usa um sistema ou outro, nunca os dois.
export const productVariationGroups = mysqlTable("product_variation_groups", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  name: varchar("name", { length: 100 }).notNull(), // ex: "Tipo de Macarrão"
  required: boolean("required").default(true).notNull(), // cliente é obrigado a escolher?
  allowMultiple: boolean("allowMultiple").default(false).notNull(), // pode marcar mais de uma opção?
  sortOrder: int("sortOrder").default(0).notNull(),
});

export const productVariationOptions = mysqlTable("product_variation_options", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  name: varchar("name", { length: 100 }).notNull(), // ex: "Talharim"
  additionalPrice: decimal("additionalPrice", { precision: 10, scale: 2 }).default("0.00").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
});

// Escolhas feitas pelo cliente num item de pedido (histórico, denormalizado —
// guarda o nome/preço adicional no momento da compra, igual orderItemFlavors).
export const orderItemVariationSelections = mysqlTable("order_item_variation_selections", {
  id: int("id").autoincrement().primaryKey(),
  orderItemId: int("orderItemId").notNull(),
  groupName: varchar("groupName", { length: 100 }).notNull(),
  optionName: varchar("optionName", { length: 100 }).notNull(),
  additionalPrice: decimal("additionalPrice", { precision: 10, scale: 2 }).default("0.00").notNull(),
});

// Controla quais categorias aparecem na Venda Regular (a loja sempre aberta).
// Mesmo padrão "opt-out" das formas de entrega: ausência de linha = visível
// (preserva o comportamento de hoje, onde tudo que está visível+em estoque
// aparece na Venda Regular). Só ganha uma linha aqui quando alguém desliga
// explicitamente — por exemplo, pra tirar a categoria "Ingressos" de lá.
export const storeRegularCategoryVisibility = mysqlTable("store_regular_category_visibility", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull().unique(),
  visible: boolean("visible").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Controla quais formas de entrega aparecem na Loja Pública, sem afetar o
// cadastro geral (usado pelo vendedor/período de vendas). Ausência de linha =
// visível (opt-out, não opt-in) — preserva o comportamento atual, onde todas
// as formas ativas já aparecem na loja.
export const storeDeliveryMethodVisibility = mysqlTable("store_delivery_method_visibility", {
  id: int("id").autoincrement().primaryKey(),
  deliveryMethodId: int("deliveryMethodId").notNull().unique(),
  visible: boolean("visible").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
