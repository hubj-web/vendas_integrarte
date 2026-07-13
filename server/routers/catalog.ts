import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc } from "drizzle-orm";
import { z } from "zod";
import {
  productCategories, productTypes, products, productChangeHistory, productFlavors,
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
      const linked = await db.select().from(products).where(eq(products.categoryId, input.id)).limit(1);
      if (linked.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Categoria possui produtos associados. Remova os vínculos antes de excluir." });
      await db.delete(productCategories).where(eq(productCategories.id, input.id));
      return { success: true };
    }),
});

// ─── PRODUCT TYPES (legacy, kept for backward compat) ────────────────────────
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
      await db.delete(productTypes).where(eq(productTypes.id, input.id));
      return { success: true };
    }),
});

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
const productsRouter = router({
  list: protectedProcedure
    .input(z.object({ categoryId: z.number().optional(), activeOnly: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select({
        id: products.id, name: products.name, unit: products.unit,
        price: products.price, cost: products.cost, description: products.description,
        active: products.active, createdAt: products.createdAt,
        productTypeId: products.productTypeId,
        categoryId: products.categoryId,
        categoryName: productCategories.name,
        supplierId: products.supplierId,
        maxFlavors: products.maxFlavors,
      })
        .from(products)
        .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
        .orderBy(asc(productCategories.sortOrder), asc(products.name));

      return rows.filter(p => {
        if (input?.categoryId && p.categoryId !== input.categoryId) return false;
        if (input?.activeOnly && !p.active) return false;
        return true;
      });
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(2), categoryId: z.number(),
      unit: z.string().min(1), price: z.string(),
      cost: z.string().default("0.00"),
      supplierId: z.number().nullable().optional(),
      description: z.string().optional(), active: z.boolean().default(true),
      maxFlavors: z.number().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Use productTypeId=1 as default (legacy field)
      await db.insert(products).values({
        name: input.name,
        categoryId: input.categoryId,
        productTypeId: 1, // legacy field, kept for backward compat
        unit: input.unit,
        price: input.price,
        cost: input.cost,
        supplierId: input.supplierId,
        description: input.description,
        active: input.active,
        maxFlavors: input.maxFlavors,
      });
      return { success: true };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(), name: z.string().min(2).optional(),
      categoryId: z.number().optional(), unit: z.string().optional(),
      price: z.string().optional(), cost: z.string().optional(),
      supplierId: z.number().nullable().optional(),
      description: z.string().optional(), active: z.boolean().optional(),
      maxFlavors: z.number().min(0).optional(),
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
      // Also delete flavors
      await db.delete(productFlavors).where(eq(productFlavors.productId, input.id));
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

// ─── PRODUCT FLAVORS ─────────────────────────────────────────────────────────
const productFlavorsRouter = router({
  list: protectedProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(productFlavors)
        .where(eq(productFlavors.productId, input.productId))
        .orderBy(asc(productFlavors.name));
    }),
  listAll: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(productFlavors)
      .where(eq(productFlavors.active, true))
      .orderBy(asc(productFlavors.name));
  }),
  create: adminProcedure
    .input(z.object({ productId: z.number(), name: z.string().min(2), description: z.string().optional(), additionalPrice: z.string().default("0.00") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(productFlavors).values(input);
      return { success: true };
    }),
  update: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), additionalPrice: z.string().optional(), active: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(productFlavors).set(data).where(eq(productFlavors.id, id));
      return { success: true };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(productFlavors).where(eq(productFlavors.id, input.id));
      return { success: true };
    }),
});

// ─── MINIPIZZA TYPES (legacy) ────────────────────────────────────────────────
const minipizzaTypesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(minipizzaTypes).orderBy(asc(minipizzaTypes.name));
  }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      supplierId: z.number().nullable().optional(),
      price: z.string().optional(),
      cost: z.string().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(minipizzaTypes).set(data).where(eq(minipizzaTypes.id, id));
      return { success: true };
    }),
});

// ─── MINIPIZZA FLAVORS (legacy) ──────────────────────────────────────────────
const minipizzaFlavorsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(minipizzaFlavors).orderBy(asc(minipizzaFlavors.name));
  }),
  getMatrix: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(minipizzaTypeFlavorMatrix);
  }),
});

// ─── JELLY FLAVORS (legacy) ──────────────────────────────────────────────────
const jellyFlavorsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(jellyFlavors).orderBy(asc(jellyFlavors.name));
  }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      price: z.string().optional(),
      cost: z.string().optional(),
      description: z.string().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(jellyFlavors).set(data).where(eq(jellyFlavors.id, id));
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
  productFlavors: productFlavorsRouter,
  minipizzaTypes: minipizzaTypesRouter,
  minipizzaFlavors: minipizzaFlavorsRouter,
  jellyFlavors: jellyFlavorsRouter,
  deliveryMethods: deliveryMethodsRouter,
});
