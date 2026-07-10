/**
 * One-time database setup route for Railway deployment.
 * Access: GET /api/db-setup?key=integrarte2026
 * This creates all tables and seeds initial data on a fresh MySQL database.
 * Safe to run multiple times (uses IF NOT EXISTS and INSERT IGNORE).
 */
import { Express } from "express";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

const SETUP_KEY = "integrarte2026";

export function registerDbSetupRoute(app: Express) {
  app.get("/api/db-setup", async (req, res) => {
    const key = req.query.key as string;
    if (key !== SETUP_KEY) {
      return res.status(403).json({ error: "Invalid setup key." });
    }

    const results: string[] = [];
    const errors: string[] = [];

    const dbInstance = await getDb();
    if (!dbInstance) {
      return res.status(500).json({ error: 'Database connection failed.' });
    }
    const run = async (label: string, query: string) => {
      try {
        await dbInstance.execute(sql.raw(query));
        results.push(`✓ ${label}`);
      } catch (e: any) {
        // Ignore "already exists" and "duplicate column" errors
        if (
          e.code === "ER_TABLE_EXISTS_ERROR" ||
          e.code === "ER_DUP_FIELDNAME" ||
          e.code === "ER_DUP_KEYNAME" ||
          (e.sqlMessage && e.sqlMessage.includes("Duplicate"))
        ) {
          results.push(`~ ${label} (already exists, skipped)`);
        } else {
          errors.push(`✗ ${label}: ${e.sqlMessage || e.message}`);
        }
      }
    };

    // ── CREATE TABLES ──────────────────────────────────────────────────────
    await run("Table: users", `
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`openId\` varchar(64),
        \`name\` text NOT NULL,
        \`email\` varchar(320) NOT NULL,
        \`loginMethod\` varchar(64) DEFAULT 'local',
        \`role\` enum('admin','launcher','delivery') NOT NULL DEFAULT 'launcher',
        \`passwordHash\` varchar(255),
        \`active\` boolean DEFAULT true NOT NULL,
        \`mustChangePassword\` boolean DEFAULT false NOT NULL,
        \`resetToken\` varchar(128),
        \`resetTokenExpiresAt\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        \`lastSignedIn\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`users_id\` PRIMARY KEY(\`id\`),
        UNIQUE(\`openId\`),
        UNIQUE(\`email\`)
      )
    `);

    await run("Table: customers", `
      CREATE TABLE IF NOT EXISTS \`customers\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(150) NOT NULL,
        \`phone\` varchar(30) NOT NULL,
        \`locationReference\` text,
        \`street\` varchar(200),
        \`number\` varchar(20),
        \`neighborhood\` varchar(100),
        \`city\` varchar(100),
        \`zipCode\` varchar(10),
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`customers_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: product_categories", `
      CREATE TABLE IF NOT EXISTS \`product_categories\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`description\` text NULL,
        \`sortOrder\` int NOT NULL DEFAULT 0,
        \`active\` boolean NOT NULL DEFAULT true,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`product_categories_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`product_categories_name_unique\` UNIQUE(\`name\`)
      )
    `);

    await run("Table: product_types", `
      CREATE TABLE IF NOT EXISTS \`product_types\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`description\` text,
        \`category\` varchar(100),
        \`categoryId\` int NULL,
        \`active\` boolean NOT NULL DEFAULT true,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`product_types_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`product_types_name_unique\` UNIQUE(\`name\`)
      )
    `);

    await run("Table: products", `
      CREATE TABLE IF NOT EXISTS \`products\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(150) NOT NULL,
        \`categoryId\` int NULL,
        \`productTypeId\` int NOT NULL DEFAULT 1,
        \`unit\` varchar(50) NOT NULL,
        \`price\` decimal(10,2) NOT NULL,
        \`cost\` decimal(10,2) NOT NULL DEFAULT 0.00,
        \`description\` text,
        \`maxFlavors\` int DEFAULT 0,
        \`active\` boolean NOT NULL DEFAULT true,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`products_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: product_flavors", `
      CREATE TABLE IF NOT EXISTS \`product_flavors\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`productId\` int NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`description\` text,
        \`additionalPrice\` decimal(10,2) DEFAULT 0.00,
        \`active\` boolean NOT NULL DEFAULT true,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`product_flavors_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: delivery_methods", `
      CREATE TABLE IF NOT EXISTS \`delivery_methods\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(150) NOT NULL,
        \`description\` text,
        \`requiresAddress\` boolean NOT NULL DEFAULT false,
        \`active\` boolean NOT NULL DEFAULT true,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`delivery_methods_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: jelly_flavors", `
      CREATE TABLE IF NOT EXISTS \`jelly_flavors\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`description\` text,
        \`price\` decimal(10,2) NOT NULL,
        \`active\` boolean NOT NULL DEFAULT true,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`jelly_flavors_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: minipizza_types", `
      CREATE TABLE IF NOT EXISTS \`minipizza_types\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(150) NOT NULL,
        \`units\` int NOT NULL,
        \`price\` decimal(10,2) NOT NULL,
        \`active\` boolean NOT NULL DEFAULT true,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`minipizza_types_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: minipizza_flavors", `
      CREATE TABLE IF NOT EXISTS \`minipizza_flavors\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`description\` text,
        \`additionalPrice\` decimal(10,2) DEFAULT '0.00',
        \`active\` boolean NOT NULL DEFAULT true,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`minipizza_flavors_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: minipizza_type_flavor_matrix", `
      CREATE TABLE IF NOT EXISTS \`minipizza_type_flavor_matrix\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`minipizzaTypeId\` int NOT NULL,
        \`minipizzaFlavorId\` int NOT NULL,
        \`active\` boolean NOT NULL DEFAULT true,
        CONSTRAINT \`minipizza_type_flavor_matrix_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: orders", `
      CREATE TABLE IF NOT EXISTS \`orders\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`customerId\` int NOT NULL,
        \`launcherId\` int NOT NULL,
        \`deliveryMethodId\` int NOT NULL,
        \`deliveryDate\` timestamp NULL,
        \`deliveryAddress\` text,
        \`paymentMethod\` enum('cash','pix') NOT NULL,
        \`status\` enum('production','in_route','delivered','paid','cancelled') NOT NULL DEFAULT 'production',
        \`paymentStatus\` enum('pending','paid','partial','cancelled') NOT NULL DEFAULT 'pending',
        \`totalAmount\` decimal(10,2) NOT NULL,
        \`notes\` text,
        \`cancelReason\` text,
        \`cancelledBy\` int,
        \`cancelledAt\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`orders_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: order_items", `
      CREATE TABLE IF NOT EXISTS \`order_items\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`orderId\` int NOT NULL,
        \`productId\` int NOT NULL,
        \`quantity\` int NOT NULL,
        \`unitPrice\` decimal(10,2) NOT NULL,
        \`subtotal\` decimal(10,2) NOT NULL,
        CONSTRAINT \`order_items_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: order_item_flavors", `
      CREATE TABLE IF NOT EXISTS \`order_item_flavors\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`orderItemId\` int NOT NULL,
        \`productFlavorId\` int NOT NULL,
        \`flavorName\` varchar(100) NOT NULL,
        CONSTRAINT \`order_item_flavors_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: order_jellies", `
      CREATE TABLE IF NOT EXISTS \`order_jellies\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`orderId\` int NOT NULL,
        \`jellyFlavorId\` int NOT NULL,
        \`quantity\` int NOT NULL,
        \`unitPrice\` decimal(10,2) NOT NULL,
        \`subtotal\` decimal(10,2) NOT NULL,
        CONSTRAINT \`order_jellies_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: order_minipizzas", `
      CREATE TABLE IF NOT EXISTS \`order_minipizzas\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`orderId\` int NOT NULL,
        \`minipizzaTypeId\` int NOT NULL,
        \`quantity\` int NOT NULL,
        \`unitPrice\` decimal(10,2) NOT NULL,
        \`subtotal\` decimal(10,2) NOT NULL,
        CONSTRAINT \`order_minipizzas_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: order_minipizza_flavors", `
      CREATE TABLE IF NOT EXISTS \`order_minipizza_flavors\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`orderMinipizzaId\` int NOT NULL,
        \`minipizzaFlavorId\` int NOT NULL,
        CONSTRAINT \`order_minipizza_flavors_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: order_status_history", `
      CREATE TABLE IF NOT EXISTS \`order_status_history\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`orderId\` int NOT NULL,
        \`userId\` int NOT NULL,
        \`fromStatus\` varchar(50),
        \`toStatus\` varchar(50) NOT NULL,
        \`notes\` text,
        \`changedAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`order_status_history_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: payment_records", `
      CREATE TABLE IF NOT EXISTS \`payment_records\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`orderId\` int NOT NULL,
        \`paymentMethod\` enum('cash','pix') NOT NULL,
        \`amount\` decimal(10,2) NOT NULL,
        \`paidAt\` timestamp NOT NULL,
        \`notes\` text,
        \`proofImageUrl\` text,
        \`proofImageKey\` varchar(500),
        \`registeredBy\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`payment_records_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: delivery_routes", `
      CREATE TABLE IF NOT EXISTS \`delivery_routes\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(200) NOT NULL,
        \`deliveryDate\` timestamp NOT NULL,
        \`deliveryUserId\` int NOT NULL,
        \`status\` enum('planned','in_progress','completed') NOT NULL DEFAULT 'planned',
        \`startedAt\` timestamp NULL,
        \`completedAt\` timestamp NULL,
        \`createdBy\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`delivery_routes_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: route_orders", `
      CREATE TABLE IF NOT EXISTS \`route_orders\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`routeId\` int NOT NULL,
        \`orderId\` int NOT NULL,
        \`position\` int NOT NULL,
        CONSTRAINT \`route_orders_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Table: delivery_records", `
      CREATE TABLE IF NOT EXISTS \`delivery_records\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`orderId\` int NOT NULL,
        \`deliveryUserId\` int NOT NULL,
        \`deliveredAt\` timestamp NOT NULL,
        \`notes\` text,
        \`proofImageUrl\` text,
        \`proofImageKey\` varchar(500),
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`delivery_records_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`delivery_records_orderId_unique\` UNIQUE(\`orderId\`)
      )
    `);

    await run("Table: product_change_history", `
      CREATE TABLE IF NOT EXISTS \`product_change_history\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`productId\` int NOT NULL,
        \`userId\` int NOT NULL,
        \`field\` varchar(100) NOT NULL,
        \`oldValue\` text,
        \`newValue\` text,
        \`changedAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`product_change_history_id\` PRIMARY KEY(\`id\`)
      )
    `);

    // ── SEED DATA ──────────────────────────────────────────────────────────
    // Admin user
    const passwordHash = await bcrypt.hash("1nt3gr@rt3sys", 10);
    await run("Seed: admin user", `
      INSERT IGNORE INTO \`users\` (openId, name, email, passwordHash, role, loginMethod, active, mustChangePassword)
      VALUES ('local-admin', 'Administrador', 'admin', '${passwordHash}', 'admin', 'local', 1, 0)
    `);

    // Sellers
    await run("Seed: sellers", `
      INSERT IGNORE INTO \`users\` (openId, name, email, passwordHash, role, loginMethod, active, mustChangePassword) VALUES
      ('local-diegocarvalho-seller', 'Diego Carvalho', 'diego83bc@gmail.com', NULL, 'launcher', 'local', 1, 0),
      ('local-aluisijoao', 'Aluísio João', 'aluisio.joao', NULL, 'launcher', 'local', 1, 0),
      ('local-natalialuiza', 'Natália Luiza', 'natalia.luiza', NULL, 'launcher', 'local', 1, 0),
      ('local-marlipinhal', 'Marli Pinhal', 'marli.pinhal', NULL, 'launcher', 'local', 1, 0),
      ('local-vanusamaria', 'Vanusa Maria', 'vanusa.maria', NULL, 'launcher', 'local', 1, 0)
    `);

    // Delivery methods
    await run("Seed: delivery methods", `
      INSERT IGNORE INTO \`delivery_methods\` (id, name, description, requiresAddress, active) VALUES
      (1, 'Retirada na loja', 'Cliente retira no local', 0, 1),
      (2, 'Entrega em domicílio', 'Entrega no endereço do cliente', 1, 1),
      (3, 'Entrega em ponto de coleta', 'Entrega em ponto combinado', 0, 1)
    `);

    // Product types (legacy, kept for backward compat)
    await run("Seed: product types", `
      INSERT IGNORE INTO \`product_types\` (id, name, category, active) VALUES
      (1, 'Geral', 'geral', 1)
    `);

    // Seed categories
    await run("Seed: product categories", `
      INSERT IGNORE INTO \`product_categories\` (id, name, description, sortOrder, active) VALUES
      (1, 'Pães de Queijo', 'Pães de queijo artesanais', 1, 1),
      (2, 'Biscoitos', 'Biscoitos artesanais', 2, 1),
      (3, 'Broas', 'Broas artesanais', 3, 1),
      (4, 'MiniPizzas', 'Minipizzas com sabores', 4, 1),
      (5, 'Geleias', 'Geleias artesanais', 5, 1)
    `);

    // Products (with categoryId)
    await run("Seed: products", `
      INSERT IGNORE INTO \`products\` (id, name, categoryId, productTypeId, unit, price, maxFlavors, active) VALUES
      (1, 'Pão de Queijo Tradicional', 1, 1, 'pacote', 27.00, 0, 1),
      (2, 'Biscoito Ferradura', 2, 1, 'pacote', 27.00, 0, 1),
      (3, 'Biscoito de Provolone', 2, 1, 'pacote', 27.00, 0, 1),
      (4, 'Broa Temperada', 3, 1, 'unidade', 27.00, 0, 1),
      (5, 'Broa Doce s/ erva', 3, 1, 'unidade', 27.00, 0, 1),
      (6, 'Mini (4 unidades)', 4, 1, 'unidade', 20.00, 2, 1),
      (7, 'Média (8 unidades)', 4, 1, 'unidade', 38.00, 3, 1),
      (8, 'Grande (12 unidades)', 4, 1, 'unidade', 55.00, 4, 1),
      (9, 'Geleia Morango', 5, 1, 'unidade', 15.00, 0, 1),
      (10, 'Geleia Uva', 5, 1, 'unidade', 15.00, 0, 1),
      (11, 'Geleia Goiaba', 5, 1, 'unidade', 15.00, 0, 1),
      (12, 'Geleia Maracujá', 5, 1, 'unidade', 15.00, 0, 1),
      (13, 'Geleia Pimenta', 5, 1, 'unidade', 18.00, 0, 1)
    `);

    // Product flavors for MiniPizzas (products 6, 7, 8)
    await run("Seed: product flavors for minipizzas", `
      INSERT IGNORE INTO \`product_flavors\` (id, productId, name, additionalPrice, active) VALUES
      (1, 6, 'Margherita', 0.00, 1),
      (2, 6, 'Frango com Catupiry', 0.00, 1),
      (3, 6, 'Calabresa', 0.00, 1),
      (4, 6, 'Quatro Queijos', 2.00, 1),
      (5, 6, 'Portuguesa', 0.00, 1),
      (6, 7, 'Margherita', 0.00, 1),
      (7, 7, 'Frango com Catupiry', 0.00, 1),
      (8, 7, 'Calabresa', 0.00, 1),
      (9, 7, 'Quatro Queijos', 2.00, 1),
      (10, 7, 'Portuguesa', 0.00, 1),
      (11, 8, 'Margherita', 0.00, 1),
      (12, 8, 'Frango com Catupiry', 0.00, 1),
      (13, 8, 'Calabresa', 0.00, 1),
      (14, 8, 'Quatro Queijos', 2.00, 1),
      (15, 8, 'Portuguesa', 0.00, 1)
    `);

    // Legacy minipizza/jelly seeds (kept for old order references)
    await run("Seed: minipizza types (legacy)", `
      INSERT IGNORE INTO \`minipizza_types\` (id, name, units, price, active) VALUES
      (1, 'Mini (4 unidades)', 4, 20.00, 1),
      (2, 'Média (8 unidades)', 8, 38.00, 1),
      (3, 'Grande (12 unidades)', 12, 55.00, 1)
    `);

    await run("Seed: minipizza flavors (legacy)", `
      INSERT IGNORE INTO \`minipizza_flavors\` (id, name, additionalPrice, active) VALUES
      (1, 'Margherita', 0.00, 1),
      (2, 'Frango com Catupiry', 0.00, 1),
      (3, 'Calabresa', 0.00, 1),
      (4, 'Quatro Queijos', 2.00, 1),
      (5, 'Portuguesa', 0.00, 1)
    `);

    await run("Seed: jelly flavors (legacy)", `
      INSERT IGNORE INTO \`jelly_flavors\` (id, name, price, active) VALUES
      (1, 'Morango', 15.00, 1),
      (2, 'Uva', 15.00, 1),
      (3, 'Goiaba', 15.00, 1),
      (4, 'Maracujá', 15.00, 1),
      (5, 'Pimenta', 18.00, 1)
    `);

    // ── MIGRATIONS (add columns to existing tables) ───────────────────────
    await run("Migration: add categoryId to product_types", `
      ALTER TABLE \`product_types\` ADD COLUMN \`categoryId\` int NULL
    `);

    await run("Migration: add categoryId to products", `
      ALTER TABLE \`products\` ADD COLUMN \`categoryId\` int NULL
    `);

    await run("Migration: add maxFlavors to products", `
      ALTER TABLE \`products\` ADD COLUMN \`maxFlavors\` int DEFAULT 0
    `);

    await run("Migration: add roles to users", `
      ALTER TABLE \`users\` ADD COLUMN \`roles\` varchar(255) NOT NULL DEFAULT '["launcher"]'
    `);

    // Sync roles field from legacy role field for existing users
    await run("Migration: sync roles from role for existing users", `
      UPDATE \`users\` SET \`roles\` = CONCAT('["', \`role\`, '"]') WHERE \`roles\` = '["launcher"]' AND \`role\` != 'launcher'
    `);

    // ── ROUTE OPTIMIZATION MIGRATIONS ──────────────────────────────────────
    await run("Migration: add startingAddress to delivery_routes", `
      ALTER TABLE \`delivery_routes\` ADD COLUMN \`startingAddress\` text AFTER \`deliveryUserId\`
    `);

    await run("Migration: add totalDistance to delivery_routes", `
      ALTER TABLE \`delivery_routes\` ADD COLUMN \`totalDistance\` decimal(10, 2) DEFAULT '0.00' AFTER \`startingAddress\`
    `);

    await run("Migration: add distanceFromPrevious to route_orders", `
      ALTER TABLE \`route_orders\` ADD COLUMN \`distanceFromPrevious\` decimal(10, 2) DEFAULT '0.00' AFTER \`position\`
    `);

    // ── SUPPLIERS MIGRATION ───────────────────────────────────────────────
    await run("Table: suppliers", `
      CREATE TABLE IF NOT EXISTS \`suppliers\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(150) NOT NULL,
        \`contactName\` varchar(150),
        \`phone\` varchar(50),
        \`email\` varchar(150) DEFAULT '',
        \`active\` boolean NOT NULL DEFAULT true,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`suppliers_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await run("Migration: add supplierId to products", `
      ALTER TABLE \`products\` ADD COLUMN \`supplierId\` int NULL
    `);

    await run("Migration: add supplierId to minipizza_types", `
      ALTER TABLE \`minipizza_types\` ADD COLUMN \`supplierId\` int NULL
    `);

    await run("Migration: add cost to products", `
      ALTER TABLE \`products\` ADD COLUMN \`cost\` decimal(10,2) NOT NULL DEFAULT 0.00
    `);

    await run("Migration: add categoryId to products", `
      ALTER TABLE \`products\` ADD COLUMN \`categoryId\` int NULL
    `);

    await run("Migration: add maxFlavors to products", `
      ALTER TABLE \`products\` ADD COLUMN \`maxFlavors\` int DEFAULT 0
    `);

    const allOk = errors.length === 0;
    return res.status(allOk ? 200 : 207).json({
      success: allOk,
      message: allOk
        ? "✅ Database setup completed successfully! You can now login at /admin with admin / 1nt3gr@rt3sys"
        : "⚠️ Setup completed with some errors. Check the errors array.",
      results,
      errors,
    });
  });
}
