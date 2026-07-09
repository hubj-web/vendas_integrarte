import { TRPCError } from "@trpc/server";
import { eq, and, gte, lte, desc, sql, count, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  orders, orderItems, orderMinipizzas, orderJellies,
  customers, users, deliveryRecords, paymentRecords,
  products, minipizzaTypes, minipizzaFlavors, jellyFlavors,
  orderItemFlavors, orderMinipizzaFlavors,
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

    const totalRevenue = allOrders
      .filter(o => o.status !== "cancelled")
      .reduce((acc, o) => acc + parseFloat(o.totalAmount), 0);

    const totalOrders = allOrders.filter(o => o.status !== "cancelled").length;

    const revenueByStatus: Record<string, number> = {};
    allOrders.forEach(o => {
      if (o.status === "cancelled") return;
      revenueByStatus[o.status] = (revenueByStatus[o.status] || 0) + parseFloat(o.totalAmount);
    });

    const deliveryUsers = await db.select().from(users).where(eq(users.role, "delivery"));

    return {
      todayOrders: todayOrders.length,
      todayRevenue,
      totalOrders,
      totalRevenue,
      pendingPayments: pendingPayments.length,
      inProduction: inProduction.length,
      inRoute: inRoute.length,
      revenueByStatus,
      deliveryUsers: deliveryUsers.length,
    };
  }),

  // ─── ORDERS LIST (for reports table) ────────────────────────────────────────
  ordersList: adminOrLauncherProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
      status: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { orders: [], total: 0 };

      const from = new Date(input.dateFrom);
      const to = new Date(input.dateTo);
      to.setHours(23, 59, 59);

      const conditions = [
        gte(orders.deliveryDate, from),
        lte(orders.deliveryDate, to),
      ];
      if (input.status && input.status !== "all") {
        conditions.push(eq(orders.status, input.status as any));
      }

      const allOrders = await db.select({
        id: orders.id,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        deliveryDate: orders.deliveryDate,
        totalAmount: orders.totalAmount,
        createdAt: orders.createdAt,
        customerId: orders.customerId,
        customerName: customers.name,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(...conditions))
        .orderBy(desc(orders.deliveryDate))
        .limit(input.limit)
        .offset((input.page - 1) * input.limit);

      const totalQuery = await db.select({ count: count() }).from(orders)
        .where(and(...conditions));

      return {
        orders: allOrders.map(o => ({
          ...o,
          deliveryDate: o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString("pt-BR") : "",
          customerName: o.customerName || "Cliente desconhecido",
        })),
        total: totalQuery[0]?.count || 0,
      };
    }),

  // ─── PRODUCTION REPORT (consolidated by supplier for production planning) ───
  production: adminOrLauncherProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const from = new Date(input.dateFrom);
      const to = new Date(input.dateTo);
      to.setHours(23, 59, 59);

      // 1. Fetch orders in the period by deliveryDate (not createdAt!)
      const orderRows = await db.select({ id: orders.id, deliveryDate: orders.deliveryDate })
        .from(orders)
        .where(and(
          gte(orders.deliveryDate, from),
          lte(orders.deliveryDate, to),
          sql`${orders.status} != 'cancelled'`
        ));

      if (orderRows.length === 0) return [];
      const orderIds = orderRows.map(o => o.id);

      // 2. Fetch regular products with flavors
      const items = await db.select({
        productId: orderItems.productId,
        productName: products.name,
        unit: products.unit,
        supplierId: products.supplierId,
        quantity: orderItems.quantity,
        orderItemId: orderItems.id,
        orderId: orderItems.orderId,
        type: sql<"product">`'product'`,
      })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));

      // 3. Fetch flavors for these items
      const itemIds = items.filter(i => i.type === "product").map(i => i.orderItemId);
      const flavorMap: Record<number, string[]> = {};
      if (itemIds.length > 0) {
        const flavorRows = await db.select({
          orderItemId: orderItemFlavors.orderItemId,
          flavorName: orderItemFlavors.flavorName,
        })
          .from(orderItemFlavors)
          .where(inArray(orderItemFlavors.orderItemId, itemIds));
        
        flavorRows.forEach(f => {
          if (!flavorMap[f.orderItemId]) flavorMap[f.orderItemId] = [];
          flavorMap[f.orderItemId].push(f.flavorName);
        });
      }

      // 4. Fetch legacy minipizzas (with supplierId from minipizzaTypes)
      const minipizzaItems = await db.select({
        productId: sql<number>`-1`,
        productName: minipizzaTypes.name,
        unit: sql<string>`'unidade'`,
        supplierId: minipizzaTypes.supplierId,
        quantity: orderMinipizzas.quantity,
        orderItemId: sql<number>`-1`,
        orderId: orderMinipizzas.orderId,
        type: sql<"minipizza">`'minipizza'`,
      })
        .from(orderMinipizzas)
        .leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
        .where(inArray(orderMinipizzas.orderId, orderIds));

      // 5. Fetch minipizza flavors
      const minipizzaOrderIds = minipizzaItems.map(m => m.orderId);
      const minipizzaFlavorMap: Record<number, string[]> = {};
      if (minipizzaOrderIds.length > 0) {
        const mpFlavorRows = await db.select({
          orderMinipizzaId: orderMinipizzaFlavors.orderMinipizzaId,
          flavorName: minipizzaFlavors.name,
        })
          .from(orderMinipizzaFlavors)
          .leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
          .where(inArray(orderMinipizzaFlavors.orderMinipizzaId, minipizzaOrderIds));

        mpFlavorRows.forEach(f => {
          if (!f.flavorName) return;
          if (!minipizzaFlavorMap[f.orderMinipizzaId]) minipizzaFlavorMap[f.orderMinipizzaId] = [];
          minipizzaFlavorMap[f.orderMinipizzaId].push(f.flavorName);
        });
      }

      // 6. Fetch legacy jellies (no supplier)
      const jellyItems = await db.select({
        productId: sql<number>`-2`,
        productName: jellyFlavors.name,
        unit: sql<string>`'unidade'`,
        supplierId: sql<number>`null`,
        quantity: orderJellies.quantity,
        orderItemId: sql<number>`-1`,
        orderId: orderJellies.orderId,
        type: sql<"jelly">`'jelly'`,
      })
        .from(orderJellies)
        .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
        .where(inArray(orderJellies.orderId, orderIds));

      // 7. Consolidate all items by supplier
      const consolidation: Record<number, { 
        supplierId: number,
        items: Record<string, { name: string, quantity: number, unit: string, flavors: Record<string, number> }> 
      }> = {};

      // Helper to add item to consolidation
      const addItem = (sId: number, name: string, qty: number, unit: string, flavors: string[] = []) => {
        if (!consolidation[sId]) consolidation[sId] = { supplierId: sId, items: {} };
        if (!consolidation[sId].items[name]) {
          consolidation[sId].items[name] = { name, quantity: 0, unit, flavors: {} };
        }
        consolidation[sId].items[name].quantity += qty;
        flavors.forEach(fName => {
          consolidation[sId].items[name].flavors[fName] = 
            (consolidation[sId].items[name].flavors[fName] || 0) + qty;
        });
      };

      // Process regular products
      items.forEach(item => {
        const sId = item.supplierId || 0;
        const flavors = flavorMap[item.orderItemId] || [];
        addItem(sId, item.productName || "Produto", item.quantity, item.unit || "un", flavors);
      });

      // Process legacy minipizzas
      minipizzaItems.forEach(mp => {
        const sId = mp.supplierId || 0;
        // Minipizza flavors are per order, not per type — collect all flavors for this type in these orders
        const mpFlavors: string[] = [];
        minipizzaOrderIds.forEach((oid, idx) => {
          if (oid === mp.orderId) {
            const mpFl = minipizzaFlavorMap[oid] || [];
            mpFl.forEach(f => mpFlavors.push(f));
          }
        });
        addItem(sId, mp.productName || "Minipizza", mp.quantity, "unidade", mpFlavors);
      });

      // Process legacy jellies
      jellyItems.forEach(jelly => {
        addItem(0, jelly.productName || "Geleia", jelly.quantity, "unidade");
      });

      return Object.values(consolidation);
    }),
});
