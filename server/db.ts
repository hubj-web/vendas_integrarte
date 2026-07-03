import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Upsert an OAuth user into the database.
 * IMPORTANT: This function NEVER overwrites the `role` of an existing user.
 * Only sets role on INSERT for new users (owner → admin, others → launcher).
 */
export async function upsertOAuthUser(user: {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  lastSignedIn?: Date;
}): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const isOwner = user.openId === ENV.ownerOpenId;
  const role = isOwner ? ("admin" as const) : ("launcher" as const);
  const now = user.lastSignedIn ?? new Date();

  // Check if user already exists
  const existing = await db.select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.openId, user.openId))
    .limit(1);

  if (existing.length > 0) {
    // User exists: only update lastSignedIn (never touch role or other fields)
    await db.update(users)
      .set({ lastSignedIn: now })
      .where(eq(users.openId, user.openId));
  } else {
    // New user: insert with default role
    await db.insert(users).values({
      openId: user.openId,
      name: user.name ?? "Usuário",
      email: user.email ?? `${user.openId}@oauth.local`,
      loginMethod: user.loginMethod ?? "oauth",
      role,
      lastSignedIn: now,
      active: true,
      mustChangePassword: false,
    });
  }
}

// Keep backward compat alias used by _core/oauth.ts
export const upsertUser = upsertOAuthUser;

/**
 * Update only the lastSignedIn timestamp for a user by openId.
 * Safe to call for local users — never touches role or other fields.
 */
export async function updateLastSignedIn(openId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.openId, openId));
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] ?? undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0] ?? undefined;
}
