import { TRPCError } from "@trpc/server";
import { eq, desc, and, gte, lte, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  customers, orders, orderItems, orderMinipizzas, orderMinipizzaFlavors,
  orderJellies, orderStatusHistory, products, minipizzaTypes, minipizzaFlavors,
  jellyFlavors, deliveryMethods, users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────
const customersRouter = router({
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(customers)
        .where(or(like(customers.name, `%${input.query}%`), like(customers.phone, `%${input.query}%`)))
        .limit(10);
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      phone: z.string().min(8),
      locationReference: z.string().optional(),
      street: z.string().optional(),
      number: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      zipCode: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.insert(customers).values(input);
      return { success: true, id: Number((result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      phone: z.string().optional(),
      locationReference: z.string().optional(),
      street: z.string().optional(),
      number: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      zipCode: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(customers).set(data).where(eq(customers.id, id));
      return { success: true };
    }),
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────
const orderItemSchema = z.object({
  productId: z.number(),
  quantity: z.number().int().positive(),
  unitPrice: z.string(),
  subtotal: z.string(),
});

const orderMinipizzaSchema = z.object({
  minipizzaTypeId: z.number(),
  flavorIds: z.array(z.number()),
  quantity: z.number().int().positive(),
  unitPrice: z.string(),
  subtotal: z.string(),
});

const orderJellySchema = z.object({
  jellyFlavorId: z.number(),
  quantity: z.number().int().positive(),
  unitPrice: z.string(),
  subtotal: z.string(),
});

const ordersRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().default(25),
      status: z.string().optional(),
      paymentStatus: z.string().optional(),
      launcherId: z.number().optional(),
      deliveryMethodId: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { data: [], total: 0 };

      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 25;
      const offset = (page - 1) * pageSize;

      const allOrders = await db.select({
        id: orders.id,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        totalAmount: orders.totalAmount,
        paymentMethod: orders.paymentMethod,
        deliveryDate: orders.deliveryDate,
        createdAt: orders.createdAt,
        notes: orders.notes,
        customerId: orders.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        launcherId: orders.launcherId,
        launcherName: users.name,
        deliveryMethodId: orders.deliveryMethodId,
        deliveryMethodName: deliveryMethods.name,
        deliveryAddress: orders.deliveryAddress,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(users, eq(orders.launcherId, users.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .orderBy(desc(orders.createdAt));

      // Filter
      let filtered = allOrders.filter(o => {
        if (ctx.user.role === "delivery") {
          // Entregadores só veem pedidos em rota ou entregues
          if (!["in_route", "delivered"].includes(o.status)) return false;
        }
        if (input?.status && o.status !== input.status) return false;
        if (input?.paymentStatus && o.paymentStatus !== input.paymentStatus) return false;
        if (input?.launcherId && o.launcherId !== input.launcherId) return false;
        if (input?.deliveryMethodId && o.deliveryMethodId !== input.deliveryMethodId) return false;
        if (input?.search) {
          const s = input.search.toLowerCase();
          if (!o.customerName?.toLowerCase().includes(s) && !o.customerPhone?.includes(s)) return false;
        }
        if (input?.dateFrom) {
          const from = new Date(input.dateFrom);
          if (o.createdAt < from) return false;
        }
        if (input?.dateTo) {
          const to = new Date(input.dateTo);
          to.setHours(23, 59, 59);
          if (o.createdAt > to) return false;
        }
        return true;
      });

      const total = filtered.length;
      const data = filtered.slice(offset, offset + pageSize);
      return { data, total };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orderRows = await db.select({
        id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus,
        totalAmount: orders.totalAmount, paymentMethod: orders.paymentMethod,
        deliveryDate: orders.deliveryDate, deliveryAddress: orders.deliveryAddress,
        notes: orders.notes, cancelReason: orders.cancelReason,
        cancelledAt: orders.cancelledAt, createdAt: orders.createdAt,
        customerId: orders.customerId, customerName: customers.name,
        customerPhone: customers.phone, customerStreet: customers.street,
        customerNumber: customers.number, customerNeighborhood: customers.neighborhood,
        customerCity: customers.city, customerLocationRef: customers.locationReference,
        launcherId: orders.launcherId, launcherName: users.name,
        deliveryMethodId: orders.deliveryMethodId, deliveryMethodName: deliveryMethods.name,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(users, eq(orders.launcherId, users.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .where(eq(orders.id, input.id))
        .limit(1);

      if (!orderRows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      const order = orderRows[0];

      const items = await db.select({
        id: orderItems.id, quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice, subtotal: orderItems.subtotal,
        productId: orderItems.productId, productName: products.name, unit: products.unit,
      }).from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, input.id));

      const mpRows = await db.select({
        id: orderMinipizzas.id, quantity: orderMinipizzas.quantity,
        unitPrice: orderMinipizzas.unitPrice, subtotal: orderMinipizzas.subtotal,
        typeId: orderMinipizzas.minipizzaTypeId, typeName: minipizzaTypes.name,
        typeUnits: minipizzaTypes.units,
      }).from(orderMinipizzas)
        .leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
        .where(eq(orderMinipizzas.orderId, input.id));

      const minipizzas = await Promise.all(mpRows.map(async mp => {
        const flavors = await db.select({ name: minipizzaFlavors.name })
          .from(orderMinipizzaFlavors)
          .leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
          .where(eq(orderMinipizzaFlavors.orderMinipizzaId, mp.id));
        return { ...mp, flavors: flavors.map(f => f.name) };
      }));

      const jellies = await db.select({
        id: orderJellies.id, quantity: orderJellies.quantity,
        unitPrice: orderJellies.unitPrice, subtotal: orderJellies.subtotal,
        flavorId: orderJellies.jellyFlavorId, flavorName: jellyFlavors.name,
      }).from(orderJellies)
        .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
        .where(eq(orderJellies.orderId, input.id));

      const history = await db.select({
        id: orderStatusHistory.id, fromStatus: orderStatusHistory.fromStatus,
        toStatus: orderStatusHistory.toStatus, notes: orderStatusHistory.notes,
        changedAt: orderStatusHistory.changedAt, userName: users.name,
      }).from(orderStatusHistory)
        .leftJoin(users, eq(orderStatusHistory.userId, users.id))
        .where(eq(orderStatusHistory.orderId, input.id))
        .orderBy(desc(orderStatusHistory.changedAt));

      return { ...order, items, minipizzas, jellies, history };
    }),

  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      deliveryMethodId: z.number(),
      deliveryDate: z.string().optional(),
      deliveryAddress: z.string().optional(),
      paymentMethod: z.enum(["cash", "pix"]),
      notes: z.string().optional(),
      totalAmount: z.string(),
      items: z.array(orderItemSchema),
      minipizzas: z.array(orderMinipizzaSchema),
      jellies: z.array(orderJellySchema),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await db.insert(orders).values({
        customerId: input.customerId,
        launcherId: ctx.user.id,
        deliveryMethodId: input.deliveryMethodId,
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : undefined,
        deliveryAddress: input.deliveryAddress,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
        totalAmount: input.totalAmount,
        status: "production",
        paymentStatus: "pending",
      });

      const orderId = Number((result as any)[0].insertId);

      // Insert items
      if (input.items.length > 0) {
        await db.insert(orderItems).values(input.items.map(i => ({ ...i, orderId })));
      }

      // Insert minipizzas
      for (const mp of input.minipizzas) {
        const mpResult = await db.insert(orderMinipizzas).values({
          orderId, minipizzaTypeId: mp.minipizzaTypeId,
          quantity: mp.quantity, unitPrice: mp.unitPrice, subtotal: mp.subtotal,
        });
        const mpId = Number((mpResult as any)[0].insertId);
        if (mp.flavorIds.length > 0) {
          await db.insert(orderMinipizzaFlavors).values(
            mp.flavorIds.map(fId => ({ orderMinipizzaId: mpId, minipizzaFlavorId: fId }))
          );
        }
      }

      // Insert jellies
      if (input.jellies.length > 0) {
        await db.insert(orderJellies).values(input.jellies.map(j => ({ ...j, orderId })));
      }

      // Status history
      await db.insert(orderStatusHistory).values({
        orderId, userId: ctx.user.id, fromStatus: null, toStatus: "production",
        notes: "Pedido criado",
      });

      return { success: true, orderId };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["production", "in_route", "delivered", "paid", "cancelled"]),
      notes: z.string().optional(),
      cancelReason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const current = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.status === "cancelled" && !input.cancelReason) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Justificativa obrigatória para cancelamento." });
      }

      const updateData: Record<string, unknown> = { status: input.status };
      if (input.status === "cancelled") {
        updateData.cancelReason = input.cancelReason;
        updateData.cancelledBy = ctx.user.id;
        updateData.cancelledAt = new Date();
        updateData.paymentStatus = "cancelled";
      }
      if (input.status === "paid") {
        updateData.paymentStatus = "paid";
      }

      await db.update(orders).set(updateData).where(eq(orders.id, input.id));
      await db.insert(orderStatusHistory).values({
        orderId: input.id, userId: ctx.user.id,
        fromStatus: current[0].status, toStatus: input.status,
        notes: input.cancelReason ?? input.notes,
      });

      return { success: true };
    }),

  updatePaymentStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      paymentStatus: z.enum(["pending", "paid", "partial", "cancelled"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(orders).set({ paymentStatus: input.paymentStatus }).where(eq(orders.id, input.id));
      return { success: true };
    }),

  pendingPayments: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({
      id: orders.id, totalAmount: orders.totalAmount,
      deliveryDate: orders.deliveryDate, createdAt: orders.createdAt,
      customerName: customers.name, customerPhone: customers.phone,
    })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(eq(orders.status, "delivered"), eq(orders.paymentStatus, "pending")))
      .orderBy(desc(orders.deliveryDate));
    return rows;
  }),
});

export const ordersRouter2 = router({
  customers: customersRouter,
  orders: ordersRouter,
});
