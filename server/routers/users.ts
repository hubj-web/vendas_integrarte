import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { eq, like, or, desc, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador." });
  }
  return next({ ctx });
});

export const usersRouter = router({
  list: adminProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      }).from(users).orderBy(asc(users.name));

      if (input?.search) {
        const s = input.search.toLowerCase();
        return rows.filter(u => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
      }
      return rows;
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(2),
      email: z.string().email(),
      role: z.enum(["admin", "launcher", "delivery"]),
      password: z.string().min(6),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "E-mail já cadastrado." });
      }

      const hash = await bcrypt.hash(input.password, 12);
      const openId = `local_${nanoid(16)}`;

      await db.insert(users).values({
        name: input.name,
        email: input.email,
        role: input.role,
        passwordHash: hash,
        openId,
        loginMethod: "local",
        active: true,
        mustChangePassword: true,
        lastSignedIn: new Date(),
      });

      return { success: true };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      role: z.enum(["admin", "launcher", "delivery"]).optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { id, ...data } = input;
      await db.update(users).set(data).where(eq(users.id, id));
      return { success: true };
    }),

  resetPassword: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const tempPassword = nanoid(10);
      const hash = await bcrypt.hash(tempPassword, 12);
      await db.update(users)
        .set({ passwordHash: hash, mustChangePassword: true })
        .where(eq(users.id, input.id));

      return { success: true, tempPassword };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode excluir sua própria conta." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Soft delete
      await db.update(users).set({ active: false }).where(eq(users.id, input.id));
      return { success: true };
    }),
});
