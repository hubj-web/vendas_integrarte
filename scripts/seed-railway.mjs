/**
 * Railway Database Setup Script
 * Creates all tables (IF NOT EXISTS) and seeds initial data.
 * Run once after creating the MySQL database on Railway:
 *   node scripts/seed-railway.mjs
 *
 * Requires DATABASE_URL environment variable to be set.
 */
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);
console.log('✓ Connected to Railway MySQL database.');

// ── CREATE TABLES ──────────────────────────────────────────────────────────
console.log('Creating tables...');

await conn.execute(`
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
    CONSTRAINT \`users_openId_unique\` UNIQUE(\`openId\`),
    CONSTRAINT \`users_email_unique\` UNIQUE(\`email\`)
  )
`);

await conn.execute(`
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

await conn.execute(`
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

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`product_categories\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`name\` varchar(100) NOT NULL,
    \`description\` text,
    \`displayOrder\` int NOT NULL DEFAULT 0,
    \`active\` boolean NOT NULL DEFAULT true,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`product_categories_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`product_categories_name_unique\` UNIQUE(\`name\`)
  )
`);

await conn.execute(`
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

await conn.execute(`
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

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`minipizza_types\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`name\` varchar(150) NOT NULL,
    \`units\` int NOT NULL DEFAULT 1,
    \`price\` decimal(10,2) NOT NULL DEFAULT 0.00,
    \`description\` text,
    \`active\` boolean NOT NULL DEFAULT true,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`minipizza_types_id\` PRIMARY KEY(\`id\`)
  )
`);

await conn.execute(`
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

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`minipizza_type_flavor_matrix\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`minipizzaTypeId\` int NOT NULL,
    \`minipizzaFlavorId\` int NOT NULL,
    \`active\` boolean NOT NULL DEFAULT true,
    CONSTRAINT \`minipizza_type_flavor_matrix_id\` PRIMARY KEY(\`id\`)
  )
`);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`jelly_flavors\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`name\` varchar(100) NOT NULL,
    \`description\` text,
    \`price\` decimal(10,2) NOT NULL DEFAULT 0.00,
    \`active\` boolean NOT NULL DEFAULT true,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`jelly_flavors_id\` PRIMARY KEY(\`id\`)
  )
`);

await conn.execute(`
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

await conn.execute(`
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

await conn.execute(`
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

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`order_minipizza_flavors\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`orderMinipizzaId\` int NOT NULL,
    \`minipizzaFlavorId\` int NOT NULL,
    CONSTRAINT \`order_minipizza_flavors_id\` PRIMARY KEY(\`id\`)
  )
`);

await conn.execute(`
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

await conn.execute(`
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

await conn.execute(`
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

await conn.execute(`
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

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`route_orders\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`routeId\` int NOT NULL,
    \`orderId\` int NOT NULL,
    \`position\` int NOT NULL,
    CONSTRAINT \`route_orders_id\` PRIMARY KEY(\`id\`)
  )
`);

await conn.execute(`
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

await conn.execute(`
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

console.log('✓ All tables created.');

// ── SEED DATA ──────────────────────────────────────────────────────────────
console.log('Seeding initial data...');

// Users
const adminPasswordHash = await bcrypt.hash('1nt3gr@rt3sys', 10);
await conn.execute(`
  INSERT IGNORE INTO users (openId, name, email, passwordHash, role, loginMethod, active, mustChangePassword)
  VALUES
    ('local-admin', 'Administrador', 'admin', ?, 'admin', 'local', 1, 0),
    ('local-diegocarvalho-seller', 'Diego Carvalho', 'diego83bc@gmail.com', NULL, 'launcher', 'local', 1, 0),
    ('local-aluisijoao', 'Aluísio João', 'aluisio.joao@integrarte', NULL, 'launcher', 'local', 1, 0),
    ('local-natalialuiza', 'Natália Luiza', 'natalia.luiza@integrarte', NULL, 'launcher', 'local', 1, 0),
    ('local-marlipinhal', 'Marli Pinhal', 'marli.pinhal@integrarte', NULL, 'launcher', 'local', 1, 0),
    ('local-vanusamaria', 'Vanusa Maria', 'vanusa.maria@integrarte', NULL, 'launcher', 'local', 1, 0)
`, [adminPasswordHash]);
console.log('✓ Users seeded');

// Product categories
await conn.execute(`
  INSERT IGNORE INTO product_categories (name, description, displayOrder, active)
  VALUES
    ('Produtos Congelados', 'Pão de queijo, biscoitos, broas e outros congelados', 10, 1),
    ('Minipizzas', 'Minipizzas em diferentes formatos e sabores', 20, 1),
    ('Geleias', 'Geleias artesanais em diversos sabores', 30, 1)
`);
console.log('✓ Product categories seeded');

// Delivery methods
await conn.execute(`
  INSERT IGNORE INTO delivery_methods (name, description, requiresAddress, active)
  VALUES
    ('Entrega em domicílio', 'Entrega no endereço do cliente', 1, 1),
    ('Retirada na loja', 'Cliente retira pessoalmente', 0, 1),
    ('Entrega em evento', 'Entrega em evento ou feira', 0, 1)
`);
console.log('✓ Delivery methods seeded');

// Product types
await conn.execute(`
  INSERT IGNORE INTO product_types (name, category, active)
  VALUES
    ('Pão de Queijo', 'Produtos Congelados', 1),
    ('Biscoito', 'Produtos Congelados', 1),
    ('Broa', 'Produtos Congelados', 1),
    ('Congelados', 'Produtos Congelados', 1)
`);
console.log('✓ Product types seeded');

// Minipizza types
await conn.execute(`
  INSERT IGNORE INTO minipizza_types (name, units, price, active)
  VALUES
    ('Mini (4 unidades)', 4, 0.00, 1),
    ('Média (8 unidades)', 8, 0.00, 1),
    ('Grande (12 unidades)', 12, 0.00, 1)
`);
console.log('✓ Minipizza types seeded');

// Minipizza flavors
await conn.execute(`
  INSERT IGNORE INTO minipizza_flavors (name, active)
  VALUES
    ('Frango com Catupiry', 1),
    ('Calabresa', 1),
    ('Mussarela', 1),
    ('Portuguesa', 1),
    ('Margherita', 1),
    ('Palmito', 1)
`);
console.log('✓ Minipizza flavors seeded');

// Jelly flavors
await conn.execute(`
  INSERT IGNORE INTO jelly_flavors (name, price, active)
  VALUES
    ('Morango', 0.00, 1),
    ('Goiaba', 0.00, 1),
    ('Maracujá', 0.00, 1),
    ('Uva', 0.00, 1),
    ('Abacaxi', 0.00, 1),
    ('Amora', 0.00, 1),
    ('Jabuticaba', 0.00, 1)
`);
console.log('✓ Jelly flavors seeded');

await conn.end();
console.log('\n✅ Database setup completed successfully!');
console.log('Admin login: admin / 1nt3gr@rt3sys');
console.log('⚠️  Change the admin password after first login!');
