import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { users } from "../../drizzle/schema";
import { getDb, getUserByEmail, getUserById } from "../db";
import { COOKIE_NAME } from "../../shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { sdk } from "../_core/sdk";

export const authRouter = router({
  me: publicProcedure.query((opts) => opts.ctx.user),

  login: publicProcedure
    .input(z.object({ email: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserByEmail(input.email);
      if (!user || !user.active) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas." });
      }
      if (!user.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Use o login OAuth para esta conta." });
      }
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas." });
      }

      // Create session JWT
      const token = await sdk.createSessionToken(user.openId ?? user.id.toString(), { name: user.name });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

      // Update lastSignedIn
      const db = await getDb();
      if (db) await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roles: user.roles,
        mustChangePassword: user.mustChangePassword,
        // Return token so frontend can store in sessionStorage as Bearer fallback
        // when browser blocks HttpOnly cookies in iframe (SameSite/Secure policy)
        sessionToken: token,
      };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      if (user.passwordHash) {
        const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual incorreta." });
      }

      const hash = await bcrypt.hash(input.newPassword, 12);
      const db = await getDb();
      if (db) {
        await db.update(users)
          .set({ passwordHash: hash, mustChangePassword: false })
          .where(eq(users.id, ctx.user.id));
      }
      return { success: true };
    }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const user = await getUserByEmail(input.email);
      // Always return success to avoid email enumeration
      if (!user) return { success: true };

      const token = nanoid(32);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      const db = await getDb();
      if (db) {
        await db.update(users)
          .set({ resetToken: token, resetTokenExpiresAt: expiresAt })
          .where(eq(users.id, user.id));
      }
      // In production, send email. For now, return token in dev.
      return { success: true, devToken: process.env.NODE_ENV === "development" ? token : undefined };
    }),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string(), newPassword: z.string().min(6) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await db.select().from(users)
        .where(eq(users.resetToken, input.token))
        .limit(1);
      const user = result[0];

      if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Token inválido ou expirado." });
      }

      const hash = await bcrypt.hash(input.newPassword, 12);
      await db.update(users)
        .set({ passwordHash: hash, resetToken: null, resetTokenExpiresAt: null, mustChangePassword: false })
        .where(eq(users.id, user.id));

      return { success: true };
    }),
});
