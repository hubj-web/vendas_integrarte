import { TRPCError } from "@trpc/server";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { suppliers } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

export const suppliersRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(suppliers).orderBy(asc(suppliers.name));
  }),
  create: adminProcedure
    .input(z.object({ 
      name: z.string().min(2), 
      contactName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional()
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(suppliers).values(input);
      return { success: true };
    }),
  update: adminProcedure
    .input(z.object({ 
      id: z.number(), 
      name: z.string().min(2).optional(),
      contactName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      active: z.boolean().optional()
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(suppliers).set(data).where(eq(suppliers.id, id));
      return { success: true };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(suppliers).where(eq(suppliers.id, input.id));
      return { success: true };
    }),
});
