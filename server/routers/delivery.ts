import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import {
  deliveryRoutes, routeOrders, orders, customers, users,
  deliveryRecords, paymentRecords, deliveryMethods,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

// ─── DELIVERY ROUTES ──────────────────────────────────────────────────────────
const routesRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      deliveryUserId: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db.select({
        id: deliveryRoutes.id, name: deliveryRoutes.name,
        deliveryDate: deliveryRoutes.deliveryDate, status: deliveryRoutes.status,
        startedAt: deliveryRoutes.startedAt, completedAt: deliveryRoutes.completedAt,
        createdAt: deliveryRoutes.createdAt,
        deliveryUserId: deliveryRoutes.deliveryUserId,
        deliveryUserName: users.name,
        totalDistance: deliveryRoutes.totalDistance,
        startingAddress: deliveryRoutes.startingAddress,
      })
        .from(deliveryRoutes)
        .leftJoin(users, eq(deliveryRoutes.deliveryUserId, users.id))
        .orderBy(desc(deliveryRoutes.deliveryDate));

      return rows.filter(r => {
        if (ctx.user.role === "delivery" && r.deliveryUserId !== ctx.user.id) return false;
        if (input?.status && r.status !== input.status) return false;
        if (input?.deliveryUserId && r.deliveryUserId !== input.deliveryUserId) return false;
        return true;
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const route = await db.select({
        id: deliveryRoutes.id, name: deliveryRoutes.name,
        deliveryDate: deliveryRoutes.deliveryDate, status: deliveryRoutes.status,
        startedAt: deliveryRoutes.startedAt, completedAt: deliveryRoutes.completedAt,
        deliveryUserId: deliveryRoutes.deliveryUserId, deliveryUserName: users.name,
        totalDistance: deliveryRoutes.totalDistance,
        startingAddress: deliveryRoutes.startingAddress,
      })
        .from(deliveryRoutes)
        .leftJoin(users, eq(deliveryRoutes.deliveryUserId, users.id))
        .where(eq(deliveryRoutes.id, input.id))
        .limit(1);

      if (!route[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const routeOrderRows = await db.select({
        id: routeOrders.id, position: routeOrders.position,
        orderId: routeOrders.orderId,
        orderStatus: orders.status, orderTotal: orders.totalAmount,
        customerName: customers.name, customerPhone: customers.phone,
        deliveryAddress: orders.deliveryAddress,
        customerStreet: customers.street, customerNumber: customers.number,
        customerNeighborhood: customers.neighborhood, customerCity: customers.city,
        customerZipCode: customers.zipCode,
      })
        .from(routeOrders)
        .leftJoin(orders, eq(routeOrders.orderId, orders.id))
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(eq(routeOrders.routeId, input.id), ne(orders.status, "cancelled")))
        .orderBy(asc(routeOrders.position));

      return { ...route[0], orders: routeOrderRows };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      deliveryDate: z.string(),
      deliveryUserId: z.number(),
      orderIds: z.array(z.number()).min(1),
      startingAddress: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const values: any = {
        name: input.name,
        deliveryDate: new Date(input.deliveryDate),
        deliveryUserId: input.deliveryUserId,
        createdBy: ctx.user.id,
        status: "planned",
      };

      if (input.startingAddress && input.startingAddress.trim() !== "") {
        values.startingAddress = input.startingAddress;
      }

      const result = await db.insert(deliveryRoutes).values(values);

      const routeId = Number((result as any).insertId);

      await db.insert(routeOrders).values(
        input.orderIds.map((orderId, idx) => ({ routeId, orderId, position: idx + 1 }))
      );

      // Update orders to in_route
      await db.update(orders).set({ status: "in_route" }).where(inArray(orders.id, input.orderIds));

      return { success: true, routeId };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["planned", "in_progress", "completed"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const updateData: Record<string, unknown> = { status: input.status };
      if (input.status === "in_progress") updateData.startedAt = new Date();
      if (input.status === "completed") updateData.completedAt = new Date();

      await db.update(deliveryRoutes).set(updateData).where(eq(deliveryRoutes.id, input.id));
      return { success: true };
    }),

  reorderOrders: protectedProcedure
    .input(z.object({
      routeId: z.number(),
      orderedIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      for (let i = 0; i < input.orderedIds.length; i++) {
        await db.update(routeOrders)
          .set({ position: i + 1 })
          .where(and(eq(routeOrders.routeId, input.routeId), eq(routeOrders.orderId, input.orderedIds[i])));
      }
      return { success: true };
    }),

  // Delete routes (returns orders to production)
  delete: protectedProcedure
    .input(z.object({ routeIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Get all orderIds from the routes being deleted
      const routeOrderRows = await db.select({ orderId: routeOrders.orderId })
        .from(routeOrders)
        .where(inArray(routeOrders.routeId, input.routeIds));

      const orderIds = routeOrderRows.map(r => r.orderId);

      // Remove route_orders entries
      await db.delete(routeOrders).where(inArray(routeOrders.routeId, input.routeIds));

      // Remove delivery_routes entries
      await db.delete(deliveryRoutes).where(inArray(deliveryRoutes.id, input.routeIds));

      // Return orders to production status
      if (orderIds.length > 0) {
        await db.update(orders)
          .set({ status: "production" })
          .where(inArray(orders.id, orderIds));
      }

      return { success: true, deletedCount: input.routeIds.length, orderIds };
    }),

  // Orders available for routing (in_route or production with delivery date)
  availableOrders: protectedProcedure
    .input(z.object({ deliveryDate: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db.select({
        id: orders.id, totalAmount: orders.totalAmount,
        deliveryDate: orders.deliveryDate, deliveryAddress: orders.deliveryAddress,
        status: orders.status,
        customerName: customers.name, customerPhone: customers.phone,
        customerStreet: customers.street, customerNumber: customers.number,
        customerNeighborhood: customers.neighborhood, customerCity: customers.city,
        customerZipCode: customers.zipCode,
        deliveryMethodName: deliveryMethods.name,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .where(eq(orders.status, "production"))
        .orderBy(asc(orders.deliveryDate));

      return rows;
    }),
});

// ─── DELIVERY RECORDS ─────────────────────────────────────────────────────────
const methodsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(deliveryMethods).where(eq(deliveryMethods.active, true)).orderBy(asc(deliveryMethods.name));
  }),
});

const deliveryRecordsRouter = router({
  register: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      notes: z.string().optional(),
      proofImageBase64: z.string().optional(),
      proofImageMime: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let proofImageUrl: string | undefined;
      let proofImageKey: string | undefined;

      if (input.proofImageBase64 && input.proofImageMime) {
        const buffer = Buffer.from(input.proofImageBase64, "base64");
        const ext = input.proofImageMime.split("/")[1] ?? "jpg";
        const key = `delivery-proofs/${input.orderId}-${Date.now()}.${ext}`;
        const stored = await storagePut(key, buffer, input.proofImageMime);
        proofImageUrl = stored.url;
        proofImageKey = stored.key;
      }

      await db.insert(deliveryRecords).values({
        orderId: input.orderId,
        deliveryUserId: ctx.user.id,
        deliveredAt: new Date(),
        notes: input.notes,
        proofImageUrl,
        proofImageKey,
      });

      await db.update(orders).set({ status: "delivered" }).where(eq(orders.id, input.orderId));

      return { success: true };
    }),

  getByOrder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(deliveryRecords).where(eq(deliveryRecords.orderId, input.orderId)).limit(1);
      return rows[0] ?? null;
    }),
});

// ─── PAYMENT RECORDS ──────────────────────────────────────────────────────────
const paymentRecordsRouter = router({
  register: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      paymentMethod: z.enum(["cash", "pix"]),
      amount: z.string(),
      notes: z.string().optional(),
      proofImageBase64: z.string().optional(),
      proofImageMime: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let proofImageUrl: string | undefined;
      let proofImageKey: string | undefined;

      if (input.proofImageBase64 && input.proofImageMime) {
        const buffer = Buffer.from(input.proofImageBase64, "base64");
        const ext = input.proofImageMime.split("/")[1] ?? "jpg";
        const key = `payment-proofs/${input.orderId}-${Date.now()}.${ext}`;
        const stored = await storagePut(key, buffer, input.proofImageMime);
        proofImageUrl = stored.url;
        proofImageKey = stored.key;
      }

      await db.insert(paymentRecords).values({
        orderId: input.orderId,
        paymentMethod: input.paymentMethod,
        amount: input.amount,
        paidAt: new Date(),
        notes: input.notes,
        proofImageUrl,
        proofImageKey,
        registeredBy: ctx.user.id,
      });

      // Check if fully paid
      const order = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (order[0]) {
        const totalPaid = await db.select({ total: paymentRecords.amount })
          .from(paymentRecords).where(eq(paymentRecords.orderId, input.orderId));
        const sumPaid = totalPaid.reduce((acc, r) => acc + parseFloat(r.total), 0);
        const orderTotal = parseFloat(order[0].totalAmount);
        const newStatus = sumPaid >= orderTotal ? "paid" : "partial";
        await db.update(orders).set({ paymentStatus: newStatus, status: sumPaid >= orderTotal ? "paid" : order[0].status })
          .where(eq(orders.id, input.orderId));
      }

      return { success: true };
    }),

  getByOrder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(paymentRecords).where(eq(paymentRecords.orderId, input.orderId)).orderBy(desc(paymentRecords.paidAt));
    }),
});

export const deliveryRouter = router({
  routes: routesRouter,
  methods: methodsRouter,
  deliveryRecords: deliveryRecordsRouter,
  paymentRecords: paymentRecordsRouter,
});
