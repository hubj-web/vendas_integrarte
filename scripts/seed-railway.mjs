/**
 * Railway Database Seed Script
 * Run after creating the MySQL database on Railway:
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
console.log('Connected to Railway MySQL database.');

// ── USERS ──────────────────────────────────────────────────────────────────
// Admin user (login: admin / password: change this after first login!)
const adminPasswordHash = await bcrypt.hash('1nt3gr@rt3sys', 10);

await conn.execute(`
  INSERT IGNORE INTO users (openId, name, email, passwordHash, role, loginMethod, active, mustChangePassword)
  VALUES
    ('local-admin', 'Administrador', 'admin', ?, 'admin', 'local', 1, 0),
    ('local-diegocarvalho-seller', 'Diego Carvalho', 'diego83bc@gmail.com', NULL, 'launcher', 'local', 1, 0),
    ('local-aluisijoao', 'Aluísio João', 'aluisio.joao', NULL, 'launcher', 'local', 1, 0),
    ('local-natalialuiza', 'Natália Luiza', 'natalia.luiza', NULL, 'launcher', 'local', 1, 0),
    ('local-marlipinhal', 'Marli Pinhal', 'marli.pinhal', NULL, 'launcher', 'local', 1, 0),
    ('local-vanusamaria', 'Vanusa Maria', 'vanusa.maria', NULL, 'launcher', 'local', 1, 0)
`, [adminPasswordHash]);
console.log('✓ Users seeded');

// ── PRODUCT CATEGORIES ─────────────────────────────────────────────────────
await conn.execute(`
  INSERT IGNORE INTO product_categories (name, description, displayOrder, active)
  VALUES
    ('Produtos Congelados', 'Pão de queijo, biscoitos, broas e outros congelados', 10, 1),
    ('Minipizzas', 'Minipizzas em diferentes formatos e sabores', 20, 1),
    ('Geleias', 'Geleias artesanais em diversos sabores', 30, 1)
`);
console.log('✓ Product categories seeded');

// ── DELIVERY METHODS ───────────────────────────────────────────────────────
await conn.execute(`
  INSERT IGNORE INTO delivery_methods (name, description, requiresAddress, active)
  VALUES
    ('Entrega em domicílio', 'Entrega no endereço do cliente', 1, 1),
    ('Retirada na loja', 'Cliente retira pessoalmente', 0, 1),
    ('Entrega em evento', 'Entrega em evento ou feira', 0, 1)
`);
console.log('✓ Delivery methods seeded');

// ── PRODUCT TYPES ──────────────────────────────────────────────────────────
await conn.execute(`
  INSERT IGNORE INTO product_types (name, categoryId, unit, active)
  SELECT 'Pão de Queijo', id, 'kg', 1 FROM product_categories WHERE name = 'Produtos Congelados' LIMIT 1
`);
await conn.execute(`
  INSERT IGNORE INTO product_types (name, categoryId, unit, active)
  SELECT 'Biscoito', id, 'kg', 1 FROM product_categories WHERE name = 'Produtos Congelados' LIMIT 1
`);
console.log('✓ Product types seeded');

// ── MINIPIZZA TYPES ────────────────────────────────────────────────────────
await conn.execute(`
  INSERT IGNORE INTO minipizza_types (name, description, active)
  VALUES
    ('Mini (4 unidades)', 'Embalagem com 4 minipizzas', 1),
    ('Média (8 unidades)', 'Embalagem com 8 minipizzas', 1),
    ('Grande (12 unidades)', 'Embalagem com 12 minipizzas', 1)
`);
console.log('✓ Minipizza types seeded');

// ── MINIPIZZA FLAVORS ──────────────────────────────────────────────────────
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

// ── JELLY FLAVORS ──────────────────────────────────────────────────────────
await conn.execute(`
  INSERT IGNORE INTO jelly_flavors (name, active)
  VALUES
    ('Morango', 1),
    ('Goiaba', 1),
    ('Maracujá', 1),
    ('Uva', 1),
    ('Abacaxi', 1),
    ('Amora', 1),
    ('Jabuticaba', 1)
`);
console.log('✓ Jelly flavors seeded');

await conn.end();
console.log('\n✅ Database seeded successfully!');
console.log('Admin login: admin / 1nt3gr@rt3sys');
console.log('⚠️  Change the admin password after first login!');
