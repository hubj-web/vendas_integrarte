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

    await run("Table: product_types", `
      CREATE TABLE IF NOT EXISTS \`product_types\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`description\` text,
        \`category\` varchar(100),
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
        \`productTypeId\` int NOT NULL,
        \`unit\` varchar(50) NOT NULL,
        \`price\` decimal(10,2) NOT NULL,
        \`description\` text,
        \`active\` boolean NOT NULL DEFAULT true,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`products_id\` PRIMARY KEY(\`id\`)
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

    // Product types
    await run("Seed: product types", `
      INSERT IGNORE INTO \`product_types\` (id, name, category, active) VALUES
      (1, 'Pão de Queijo', 'paes', 1),
      (2, 'Biscoito', 'biscoitos', 1),
      (3, 'Broa', 'paes', 1),
      (4, 'Congelados', 'congelados', 1),
      (5, 'Outros', 'outros', 1)
    `);

    // Products
    await run("Seed: products", `
      INSERT IGNORE INTO \`products\` (id, name, productTypeId, unit, price, active) VALUES
      (1, 'Pão de Queijo Tradicional', 1, 'pacote', 27.00, 1),
      (2, 'Biscoito Ferradura', 2, 'pacote', 27.00, 1),
      (3, 'Biscoito de Provolone', 2, 'pacote', 27.00, 1),
      (4, 'Broa Temperada', 3, 'unidade', 27.00, 1),
      (5, 'Broa Doce s/ erva', 3, 'unidade', 27.00, 1)
    `);

    // Jelly flavors
    await run("Seed: jelly flavors", `
      INSERT IGNORE INTO \`jelly_flavors\` (id, name, price, active) VALUES
      (1, 'Morango', 15.00, 1),
      (2, 'Uva', 15.00, 1),
      (3, 'Goiaba', 15.00, 1),
      (4, 'Maracujá', 15.00, 1),
      (5, 'Pimenta', 18.00, 1)
    `);

    // Minipizza types
    await run("Seed: minipizza types", `
      INSERT IGNORE INTO \`minipizza_types\` (id, name, units, price, active) VALUES
      (1, 'Mini (4 unidades)', 4, 20.00, 1),
      (2, 'Média (8 unidades)', 8, 38.00, 1),
      (3, 'Grande (12 unidades)', 12, 55.00, 1)
    `);

    // Minipizza flavors
    await run("Seed: minipizza flavors", `
      INSERT IGNORE INTO \`minipizza_flavors\` (id, name, additionalPrice, active) VALUES
      (1, 'Margherita', 0.00, 1),
      (2, 'Frango com Catupiry', 0.00, 1),
      (3, 'Calabresa', 0.00, 1),
      (4, 'Quatro Queijos', 2.00, 1),
      (5, 'Portuguesa', 0.00, 1)
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
