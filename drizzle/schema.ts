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

// ─── PRODUCT TYPES (customizable categories) ──────────────────────────────────
export const productTypes = mysqlTable("product_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductType = typeof productTypes.$inferSelect;

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  productTypeId: int("productTypeId").notNull(),
  unit: varchar("unit", { length: 50 }).notNull(), // bandeja, caixa, pote, unidade, etc.
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;

export const productChangeHistory = mysqlTable("product_change_history", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  userId: int("userId").notNull(),
  field: varchar("field", { length: 100 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
});

// ─── MINIPIZZA TYPES ──────────────────────────────────────────────────────────
export const minipizzaTypes = mysqlTable("minipizza_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  units: int("units").notNull(), // quantidade de unidades por embalagem
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MinipizzaType = typeof minipizzaTypes.$inferSelect;

// ─── MINIPIZZA FLAVORS ────────────────────────────────────────────────────────
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

// ─── MINIPIZZA TYPE × FLAVOR COMPATIBILITY ────────────────────────────────────
export const minipizzaTypeFlavorMatrix = mysqlTable("minipizza_type_flavor_matrix", {
  id: int("id").autoincrement().primaryKey(),
  minipizzaTypeId: int("minipizzaTypeId").notNull(),
  minipizzaFlavorId: int("minipizzaFlavorId").notNull(),
  active: boolean("active").default(true).notNull(),
});

// ─── JELLY FLAVORS ────────────────────────────────────────────────────────────
export const jellyFlavors = mysqlTable("jelly_flavors", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
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
  street: varchar("street", { length: 200 }),
  number: varchar("number", { length: 20 }),
  neighborhood: varchar("neighborhood", { length: 100 }),
  city: varchar("city", { length: 100 }),
  zipCode: varchar("zipCode", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;

// ─── ORDERS ───────────────────────────────────────────────────────────────────
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  launcherId: int("launcherId").notNull(), // usuário que lançou
  deliveryMethodId: int("deliveryMethodId").notNull(),
  deliveryDate: timestamp("deliveryDate"),
  deliveryAddress: text("deliveryAddress"), // endereço de entrega (se necessário)
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "pix"]).notNull(),
  status: mysqlEnum("status", ["production", "in_route", "delivered", "paid", "cancelled"]).default("production").notNull(),
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

// ─── ORDER ITEMS (produtos comuns) ────────────────────────────────────────────
export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  productId: int("productId").notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
});

// ─── ORDER MINIPIZZAS ─────────────────────────────────────────────────────────
export const orderMinipizzas = mysqlTable("order_minipizzas", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  minipizzaTypeId: int("minipizzaTypeId").notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(), // preço final (tipo + sabores)
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
});

// ─── ORDER MINIPIZZA FLAVORS ──────────────────────────────────────────────────
export const orderMinipizzaFlavors = mysqlTable("order_minipizza_flavors", {
  id: int("id").autoincrement().primaryKey(),
  orderMinipizzaId: int("orderMinipizzaId").notNull(),
  minipizzaFlavorId: int("minipizzaFlavorId").notNull(),
});

// ─── ORDER JELLIES ────────────────────────────────────────────────────────────
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
  position: int("position").notNull(), // ordem na rota
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
