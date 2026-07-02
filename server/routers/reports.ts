import { TRPCError } from "@trpc/server";
import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";
import { z } from "zod";
import {
  orders, orderItems, orderMinipizzas, orderJellies,
  customers, users, deliveryRecords, paymentRecords,
  products, minipizzaTypes, jellyFlavors,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const adminOrLauncherProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role === "delivery") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

export const reportsRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const allOrders = await db.select({
      id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus,
      totalAmount: orders.totalAmount, createdAt: orders.createdAt,
    }).from(orders);

    const todayOrders = allOrders.filter(o => o.createdAt >= today && o.createdAt < tomorrow);
    const pendingPayments = allOrders.filter(o => o.status === "delivered" && o.paymentStatus === "pending");
    const inProduction = allOrders.filter(o => o.status === "production");
    const inRoute = allOrders.filter(o => o.status === "in_route");

    const todayRevenue = todayOrders
      .filter(o => o.status !== "cancelled")
      .reduce((acc, o) => acc + parseFloat(o.totalAmount), 0);

    const pendingAmount = pendingPayments.reduce((acc, o) => acc + parseFloat(o.totalAmount), 0);

    // Recent orders
    const recentOrders = await db.select({
      id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus,
      totalAmount: orders.totalAmount, createdAt: orders.createdAt,
      customerName: customers.name,
    })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .orderBy(desc(orders.createdAt))
      .limit(5);

    return {
      todayOrdersCount: todayOrders.length,
      todayRevenue,
      pendingPaymentsCount: pendingPayments.length,
      pendingAmount,
      inProductionCount: inProduction.length,
      inRouteCount: inRoute.length,
      recentOrders,
    };
  }),

  sales: adminOrLauncherProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const from = new Date(input.dateFrom);
      const to = new Date(input.dateTo);
      to.setHours(23, 59, 59);

      const allOrders = await db.select({
        id: orders.id, totalAmount: orders.totalAmount,
        status: orders.status, createdAt: orders.createdAt,
        launcherId: orders.launcherId, launcherName: users.name,
      })
        .from(orders)
        .leftJoin(users, eq(orders.launcherId, users.id))
        .where(and(gte(orders.createdAt, from), lte(orders.createdAt, to)));

      const validOrders = allOrders.filter(o => o.status !== "cancelled");
      const totalRevenue = validOrders.reduce((acc, o) => acc + parseFloat(o.totalAmount), 0);
      const avgTicket = validOrders.length > 0 ? totalRevenue / validOrders.length : 0;

      // By launcher
      const byLauncher: Record<string, { name: string; count: number; total: number }> = {};
      for (const o of validOrders) {
        const key = String(o.launcherId);
        if (!byLauncher[key]) byLauncher[key] = { name: o.launcherName ?? "Desconhecido", count: 0, total: 0 };
        byLauncher[key].count++;
        byLauncher[key].total += parseFloat(o.totalAmount);
      }

      // Top products
      const itemRows = await db.select({
        productId: orderItems.productId, productName: products.name,
        quantity: orderItems.quantity, subtotal: orderItems.subtotal,
        orderId: orderItems.orderId,
      })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .leftJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(gte(orders.createdAt, from), lte(orders.createdAt, to)));

      const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      for (const r of itemRows) {
        const key = String(r.productId);
        if (!productMap[key]) productMap[key] = { name: r.productName ?? "?", qty: 0, revenue: 0 };
        productMap[key].qty += r.quantity;
        productMap[key].revenue += parseFloat(r.subtotal);
      }
      const topProducts = Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 10);

      return {
        totalOrders: validOrders.length,
        totalRevenue,
        avgTicket,
        byLauncher: Object.values(byLauncher),
        topProducts,
      };
    }),

  financial: adminOrLauncherProcedure
    .input(z.object({ dateFrom: z.string(), dateTo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const from = new Date(input.dateFrom);
      const to = new Date(input.dateTo);
      to.setHours(23, 59, 59);

      const allOrders = await db.select({
        id: orders.id, totalAmount: orders.totalAmount,
        paymentStatus: orders.paymentStatus, status: orders.status,
        customerName: customers.name, customerPhone: customers.phone,
        createdAt: orders.createdAt,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(gte(orders.createdAt, from), lte(orders.createdAt, to)));

      const payments = await db.select({
        amount: paymentRecords.amount,
        paymentMethod: paymentRecords.paymentMethod,
        paidAt: paymentRecords.paidAt,
      })
        .from(paymentRecords)
        .where(and(gte(paymentRecords.paidAt, from), lte(paymentRecords.paidAt, to)));

      const totalReceived = payments.reduce((acc, p) => acc + parseFloat(p.amount), 0);
      const cashReceived = payments.filter(p => p.paymentMethod === "cash").reduce((acc, p) => acc + parseFloat(p.amount), 0);
      const pixReceived = payments.filter(p => p.paymentMethod === "pix").reduce((acc, p) => acc + parseFloat(p.amount), 0);

      const pendingOrders = allOrders.filter(o => o.paymentStatus === "pending" && o.status !== "cancelled");
      const totalPending = pendingOrders.reduce((acc, o) => acc + parseFloat(o.totalAmount), 0);

      return {
        totalReceived, cashReceived, pixReceived, totalPending,
        pendingOrders: pendingOrders.slice(0, 20),
      };
    }),

  deliveries: adminOrLauncherProcedure
    .input(z.object({ dateFrom: z.string(), dateTo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const from = new Date(input.dateFrom);
      const to = new Date(input.dateTo);
      to.setHours(23, 59, 59);

      const allOrders = await db.select({
        id: orders.id, status: orders.status,
      })
        .from(orders)
        .where(and(gte(orders.createdAt, from), lte(orders.createdAt, to)));

      const delivered = allOrders.filter(o => ["delivered", "paid"].includes(o.status));
      const deliveryRate = allOrders.length > 0 ? (delivered.length / allOrders.length) * 100 : 0;

      const deliveryRows = await db.select({
        deliveryUserId: deliveryRecords.deliveryUserId,
        deliveryUserName: users.name,
        deliveredAt: deliveryRecords.deliveredAt,
      })
        .from(deliveryRecords)
        .leftJoin(users, eq(deliveryRecords.deliveryUserId, users.id))
        .where(and(gte(deliveryRecords.deliveredAt, from), lte(deliveryRecords.deliveredAt, to)));

      const byDeliverer: Record<string, { name: string; count: number }> = {};
      for (const r of deliveryRows) {
        const key = String(r.deliveryUserId);
        if (!byDeliverer[key]) byDeliverer[key] = { name: r.deliveryUserName ?? "?", count: 0 };
        byDeliverer[key].count++;
      }

      return {
        totalOrders: allOrders.length,
        deliveredCount: delivered.length,
        deliveryRate,
        byDeliverer: Object.values(byDeliverer),
      };
    }),

  overduePayments: protectedProcedure
    .input(z.object({ daysThreshold: z.number().default(3) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const threshold = new Date();
      threshold.setDate(threshold.getDate() - input.daysThreshold);

      const rows = await db.select({
        id: orders.id, totalAmount: orders.totalAmount,
        deliveryDate: orders.deliveryDate, updatedAt: orders.updatedAt,
        customerName: customers.name, customerPhone: customers.phone,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(eq(orders.status, "delivered"), eq(orders.paymentStatus, "pending")));

      return rows.filter(o => {
        const refDate = o.deliveryDate ?? o.updatedAt;
        return refDate <= threshold;
      });
    }),
});
