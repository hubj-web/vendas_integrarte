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
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "pix"]).notNull(),
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
