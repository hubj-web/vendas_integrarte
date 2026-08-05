import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { eq, like, or, desc, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { sendWelcomeEmail } from "../email";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && !hasRole(ctx.user, "admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador." });
  }
  return next({ ctx });
});

/** Helper to parse roles JSON string */
function parseRoles(rolesStr: string | null | undefined): string[] {
  if (!rolesStr) return [];
  try {
    const parsed = JSON.parse(rolesStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Check if user has a specific role */
function hasRole(user: { role?: string; roles?: string | null }, roleName: string): boolean {
  // Check legacy field first
  if (user.role === roleName) return true;
  // Check new roles array
  const roles = parseRoles(user.roles);
  return roles.includes(roleName);
}

export { parseRoles, hasRole };

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
        roles: users.roles,
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

  /**
   * Permite que o próprio usuário logado edite seus dados (nome/e-mail) —
   * diferente de "update", que é o admin editando qualquer pessoa.
   * Trocar o e-mail exige a senha atual, por segurança (é o identificador de login).
   */
  updateOwnProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      currentPassword: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [me] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      if (!me) throw new TRPCError({ code: "NOT_FOUND" });

      const updateData: Record<string, unknown> = {};
      if (input.name) updateData.name = input.name;

      if (input.email && input.email !== me.email) {
        if (!input.currentPassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe sua senha atual para trocar o e-mail." });
        }
        const valid = me.passwordHash ? await bcrypt.compare(input.currentPassword, me.passwordHash) : false;
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual incorreta." });

        const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (existing.length > 0 && existing[0].id !== ctx.user.id) {
          throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já está em uso por outra conta." });
        }
        updateData.email = input.email;
      }

      if (Object.keys(updateData).length > 0) {
        await db.update(users).set(updateData).where(eq(users.id, ctx.user.id));
      }

      return { success: true };
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(2),
      email: z.string().email(),
      roles: z.array(z.enum(["admin", "launcher", "delivery"])).min(1),
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

      // Primary role = first in the array (for legacy compatibility)
      const primaryRole = input.roles.includes("admin") ? "admin" : input.roles[0];

      await db.insert(users).values({
        name: input.name,
        email: input.email,
        role: primaryRole,
        roles: JSON.stringify(input.roles),
        passwordHash: hash,
        openId,
        loginMethod: "local",
        active: true,
        mustChangePassword: true,
        lastSignedIn: new Date(),
      });

      // Não trava a resposta esperando o e-mail sair — se o envio demorar ou
      // falhar, o usuário já foi criado normalmente de qualquer forma.
      sendWelcomeEmail({
        to: input.email, name: input.name,
        temporaryPassword: input.password, role: primaryRole,
      }).catch((err) => console.error("[Users] Falha ao enviar e-mail de boas-vindas:", err));

      return { success: true };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      roles: z.array(z.enum(["admin", "launcher", "delivery"])).min(1).optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { id, roles: newRoles, ...data } = input;
      const updateData: Record<string, unknown> = { ...data };

      if (newRoles) {
        updateData.roles = JSON.stringify(newRoles);
        // Keep legacy role field in sync
        updateData.role = newRoles.includes("admin") ? "admin" : newRoles[0];
      }

      await db.update(users).set(updateData).where(eq(users.id, id));
      return { success: true };
    }),

  resetPassword: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [existing] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const tempPassword = nanoid(10);
      const hash = await bcrypt.hash(tempPassword, 12);
      await db.update(users)
        .set({ passwordHash: hash, mustChangePassword: true })
        .where(eq(users.id, input.id));

      // Idem: não trava a resposta esperando o e-mail sair
      sendWelcomeEmail({
        to: existing.email, name: existing.name,
        temporaryPassword: tempPassword, role: existing.role,
      }).catch((err) => console.error("[Users] Falha ao enviar e-mail de reset:", err));

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
