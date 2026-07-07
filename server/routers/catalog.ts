import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc } from "drizzle-orm";
import { z } from "zod";
import {
  productCategories, productTypes, products, productChangeHistory,
  minipizzaTypes, minipizzaFlavors, minipizzaTypeFlavorMatrix,
  jellyFlavors, deliveryMethods,
  orderItems, orderMinipizzas, orderJellies,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

// ─── PRODUCT CATEGORIES ───────────────────────────────────────────────────────
const categoriesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(productCategories).orderBy(asc(productCategories.sortOrder), asc(productCategories.name));
  }),
  create: adminProcedure
    .input(z.object({ name: z.string().min(2), description: z.string().optional(), sortOrder: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(productCategories).values({ name: input.name, description: input.description || "", sortOrder: input.sortOrder ?? 0 });
      return { success: true };
    }),
  update: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().min(2).optional(), description: z.string().optional(), sortOrder: z.number().optional(), active: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(productCategories).set(data).where(eq(productCategories.id, id));
      return { success: true };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const linked = await db.select().from(productTypes).where(eq(productTypes.categoryId, input.id)).limit(1);
      if (linked.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Categoria possui tipos de produto associados. Remova os vínculos antes de excluir." });
      await db.delete(productCategories).where(eq(productCategories.id, input.id));
      return { success: true };
    }),
});

// ─── PRODUCT TYPES ────────────────────────────────────────────────────────────
const productTypesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select({
      id: productTypes.id, name: productTypes.name, description: productTypes.description,
      active: productTypes.active, createdAt: productTypes.createdAt,
      categoryId: productTypes.categoryId,
      categoryName: productCategories.name,
    })
      .from(productTypes)
      .leftJoin(productCategories, eq(productTypes.categoryId, productCategories.id))
      .orderBy(asc(productCategories.sortOrder), asc(productTypes.name));
  }),
  create: adminProcedure
    .input(z.object({ name: z.string().min(2), categoryId: z.number().nullable().optional(), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(productTypes).values({ name: input.name, categoryId: input.categoryId ?? null, description: input.description });
      return { success: true };
    }),
  update: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().min(2).optional(), categoryId: z.number().nullable().optional(), description: z.string().optional(), active: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(productTypes).set(data).where(eq(productTypes.id, id));
      return { success: true };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const linked = await db.select().from(products).where(eq(products.productTypeId, input.id)).limit(1);
      if (linked.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Tipo possui produtos associados. Desative-o em vez de excluir." });
      await db.delete(productTypes).where(eq(productTypes.id, input.id));
      return { success: true };
    }),
});

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
const productsRouter = router({
  list: protectedProcedure
    .input(z.object({ typeId: z.number().optional(), activeOnly: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select({
        id: products.id, name: products.name, unit: products.unit,
        price: products.price, description: products.description,
        active: products.active, createdAt: products.createdAt,
        productTypeId: products.productTypeId,
        typeName: productTypes.name,
        categoryId: productTypes.categoryId,
        categoryName: productCategories.name,
      })
        .from(products)
        .leftJoin(productTypes, eq(products.productTypeId, productTypes.id))
        .leftJoin(productCategories, eq(productTypes.categoryId, productCategories.id))
        .orderBy(asc(productCategories.sortOrder), asc(productTypes.name), asc(products.name));

      return rows.filter(p => {
        if (input?.typeId && p.productTypeId !== input.typeId) return false;
        if (input?.activeOnly && !p.active) return false;
        return true;
      });
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(2), productTypeId: z.number(),
      unit: z.string().min(1), price: z.string(),
      description: z.string().optional(), active: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(products).values(input);
      return { success: true };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(), name: z.string().min(2).optional(),
      productTypeId: z.number().optional(), unit: z.string().optional(),
      price: z.string().optional(), description: z.string().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const current = await db.select().from(products).where(eq(products.id, input.id)).limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const { id, ...data } = input;
      for (const [field, newVal] of Object.entries(data)) {
        const oldVal = (current[0] as Record<string, unknown>)[field];
        if (oldVal !== undefined && String(oldVal) !== String(newVal)) {
          await db.insert(productChangeHistory).values({
            productId: id, userId: ctx.user.id,
            field, oldValue: String(oldVal), newValue: String(newVal),
          });
        }
      }
      await db.update(products).set(data).where(eq(products.id, id));
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const linked = await db.select().from(orderItems).where(eq(orderItems.productId, input.id)).limit(1);
      if (linked.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Produto possui pedidos associados. Desative-o em vez de excluir." });
      await db.delete(products).where(eq(products.id, input.id));
      return { success: true };
    }),

  history: adminProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(productChangeHistory)
        .where(eq(productChangeHistory.productId, input.productId))
        .orderBy(desc(productChangeHistory.changedAt));
    }),
});

// ─── MINIPIZZA TYPES ──────────────────────────────────────────────────────────
const minipizzaTypesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(minipizzaTypes).orderBy(asc(minipizzaTypes.name));
  }),
  create: adminProcedure
    .input(z.object({ name: z.string().min(2), units: z.number().int().positive(), price: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(minipizzaTypes).values(input);
      return { success: true };
    }),
  update: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), units: z.number().optional(), price: z.string().optional(), active: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(minipizzaTypes).set(data).where(eq(minipizzaTypes.id, id));
      return { success: true };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const linked = await db.select().from(orderMinipizzas).where(eq(orderMinipizzas.minipizzaTypeId, input.id)).limit(1);
      if (linked.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Tipo possui pedidos associados." });
      await db.delete(minipizzaTypeFlavorMatrix).where(eq(minipizzaTypeFlavorMatrix.minipizzaTypeId, input.id));
      await db.delete(minipizzaTypes).where(eq(minipizzaTypes.id, input.id));
      return { success: true };
    }),
});

// ─── MINIPIZZA FLAVORS ────────────────────────────────────────────────────────
const minipizzaFlavorsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(minipizzaFlavors).orderBy(asc(minipizzaFlavors.name));
  }),
  create: adminProcedure
    .input(z.object({ name: z.string().min(2), description: z.string().optional(), additionalPrice: z.string().default("0.00") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(minipizzaFlavors).values(input);
      return { success: true };
    }),
  update: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), additionalPrice: z.string().optional(), active: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(minipizzaFlavors).set(data).where(eq(minipizzaFlavors.id, id));
      return { success: true };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(minipizzaTypeFlavorMatrix).where(eq(minipizzaTypeFlavorMatrix.minipizzaFlavorId, input.id));
      await db.delete(minipizzaFlavors).where(eq(minipizzaFlavors.id, input.id));
      return { success: true };
    }),
  getMatrix: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(minipizzaTypeFlavorMatrix);
  }),
  setCompatibility: adminProcedure
    .input(z.object({ typeId: z.number(), flavorId: z.number(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db.select().from(minipizzaTypeFlavorMatrix)
        .where(and(eq(minipizzaTypeFlavorMatrix.minipizzaTypeId, input.typeId), eq(minipizzaTypeFlavorMatrix.minipizzaFlavorId, input.flavorId)))
        .limit(1);
      if (existing.length > 0) {
        await db.update(minipizzaTypeFlavorMatrix).set({ active: input.active })
          .where(and(eq(minipizzaTypeFlavorMatrix.minipizzaTypeId, input.typeId), eq(minipizzaTypeFlavorMatrix.minipizzaFlavorId, input.flavorId)));
      } else {
        await db.insert(minipizzaTypeFlavorMatrix).values({ minipizzaTypeId: input.typeId, minipizzaFlavorId: input.flavorId, active: input.active });
      }
      return { success: true };
    }),
});

// ─── JELLY FLAVORS ────────────────────────────────────────────────────────────
const jellyFlavorsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(jellyFlavors).orderBy(asc(jellyFlavors.name));
  }),
  create: adminProcedure
    .input(z.object({ name: z.string().min(2), description: z.string().optional(), price: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(jellyFlavors).values(input);
      return { success: true };
    }),
  update: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), price: z.string().optional(), active: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(jellyFlavors).set(data).where(eq(jellyFlavors.id, id));
      return { success: true };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const linked = await db.select().from(orderJellies).where(eq(orderJellies.jellyFlavorId, input.id)).limit(1);
      if (linked.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Sabor possui pedidos associados." });
      await db.delete(jellyFlavors).where(eq(jellyFlavors.id, input.id));
      return { success: true };
    }),
});

// ─── DELIVERY METHODS ─────────────────────────────────────────────────────────
const deliveryMethodsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(deliveryMethods).orderBy(asc(deliveryMethods.name));
  }),
  create: adminProcedure
    .input(z.object({ name: z.string().min(2), description: z.string().optional(), requiresAddress: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(deliveryMethods).values(input);
      return { success: true };
    }),
  update: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), requiresAddress: z.boolean().optional(), active: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(deliveryMethods).set(data).where(eq(deliveryMethods.id, id));
      return { success: true };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(deliveryMethods).set({ active: false }).where(eq(deliveryMethods.id, input.id));
      return { success: true };
    }),
});

export const catalogRouter = router({
  categories: categoriesRouter,
  productTypes: productTypesRouter,
  products: productsRouter,
  minipizzaTypes: minipizzaTypesRouter,
  minipizzaFlavors: minipizzaFlavorsRouter,
  jellyFlavors: jellyFlavorsRouter,
  deliveryMethods: deliveryMethodsRouter,
});
