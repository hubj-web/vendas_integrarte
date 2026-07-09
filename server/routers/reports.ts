import { TRPCError } from "@trpc/server";
import { eq, and, gte, lte, desc, sql, count, inArray, isNull, or } from "drizzle-orm";
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

      // 1. Fetch orders in the period
      // Use deliveryDate if set, otherwise fallback to createdAt
      // This ensures orders without deliveryDate are still found
      const orderRows = await db.select({ id: orders.id, deliveryDate: orders.deliveryDate, createdAt: orders.createdAt })
        .from(orders)
        .where(and(
          sql`${orders.status} != 'cancelled'`,
          or(
            // Orders with deliveryDate in the range
            and(
              gte(orders.deliveryDate, from),
              lte(orders.deliveryDate, to)
            ),
            // Orders without deliveryDate but createdAt in the range
            and(
              isNull(orders.deliveryDate),
              gte(orders.createdAt, from),
              lte(orders.createdAt, to)
            )
          )
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
        unitPrice: orderItems.unitPrice,
        cost: products.cost,
        orderItemId: orderItems.id,
        orderId: orderItems.orderId,
      })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));

      // 3. Fetch flavors for these items
      const itemIds = items.map(i => i.orderItemId);
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
        productId: orderMinipizzas.minipizzaTypeId,
        productName: minipizzaTypes.name,
        unit: sql<string>`'unidade'`,
        supplierId: minipizzaTypes.supplierId,
        quantity: orderMinipizzas.quantity,
        unitPrice: orderMinipizzas.unitPrice,
        cost: minipizzaTypes.price, // For legacy, price is cost? Or use 0
        orderId: orderMinipizzas.orderId,
      })
        .from(orderMinipizzas)
        .leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
        .where(inArray(orderMinipizzas.orderId, orderIds));

      // 5. Fetch minipizza flavors per order
      const minipizzaFlavorMap: Record<number, string[]> = {};
      if (minipizzaItems.length > 0) {
        // Correct approach: orderMinipizzas has orderId, and orderMinipizzaFlavors links to orderMinipizzas
        const mpFlavorRows = await db.select({
          orderId: orderMinipizzas.orderId,
          flavorName: minipizzaFlavors.name,
        })
          .from(orderMinipizzaFlavors)
          .leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
          .leftJoin(orderMinipizzas, eq(orderMinipizzaFlavors.orderMinipizzaId, orderMinipizzas.id))
          .where(inArray(orderMinipizzas.orderId, orderIds));

        mpFlavorRows.forEach(f => {
          if (!f.flavorName || !f.orderId) return;
          if (!minipizzaFlavorMap[f.orderId]) minipizzaFlavorMap[f.orderId] = [];
          minipizzaFlavorMap[f.orderId].push(f.flavorName);
        });
      }

      // 6. Fetch legacy jellies (no supplier)
      const jellyItems = await db.select({
        productId: orderJellies.jellyFlavorId,
        productName: jellyFlavors.name,
        unit: sql<string>`'unidade'`,
        supplierId: sql<number>`NULL`,
        quantity: orderJellies.quantity,
        unitPrice: orderJellies.unitPrice,
        orderId: orderJellies.orderId,
      })
        .from(orderJellies)
        .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
        .where(inArray(orderJellies.orderId, orderIds));

      // 7. Consolidate all items by supplier
      const consolidation: Record<number, { 
        supplierId: number,
        totalCost: number,
        totalRevenue: number,
        totalProfit: number,
        items: Record<string, { name: string, quantity: number, unit: string, revenue: number, cost: number, profit: number, flavors: Record<string, number> }> 
      }> = {};

      // Helper to add item to consolidation
      const addItem = (sId: number, name: string, qty: number, unit: string, unitPrice: number, unitCost: number, flavors: string[] = []) => {
        if (!consolidation[sId]) consolidation[sId] = { supplierId: sId, totalCost: 0, totalRevenue: 0, totalProfit: 0, items: {} };
        if (!consolidation[sId].items[name]) {
          consolidation[sId].items[name] = { name, quantity: 0, unit, revenue: 0, cost: 0, profit: 0, flavors: {} };
        }
        
        const itemRevenue = qty * unitPrice;
        const itemCost = qty * unitCost;
        const itemProfit = itemRevenue - itemCost;

        consolidation[sId].items[name].quantity += qty;
        consolidation[sId].items[name].revenue += itemRevenue;
        consolidation[sId].items[name].cost += itemCost;
        consolidation[sId].items[name].profit += itemProfit;
        
        consolidation[sId].totalRevenue += itemRevenue;
        consolidation[sId].totalCost += itemCost;
        consolidation[sId].totalProfit += itemProfit;

        flavors.forEach(fName => {
          consolidation[sId].items[name].flavors[fName] = 
            (consolidation[sId].items[name].flavors[fName] || 0) + qty;
        });
      };

      // Process regular products
      items.forEach(item => {
        const sId = item.supplierId || 0;
        const flavors = flavorMap[item.orderItemId] || [];
        addItem(sId, item.productName || "Produto", item.quantity, item.unit || "un", Number(item.unitPrice), Number(item.cost || 0), flavors);
      });

      // Process legacy minipizzas
      minipizzaItems.forEach(mp => {
        const sId = mp.supplierId || 0;
        const flavors = minipizzaFlavorMap[mp.orderId] || [];
        addItem(sId, mp.productName || "Minipizza", mp.quantity, "unidade", Number(mp.unitPrice), Number(mp.cost || 0), flavors);
      });

      // Process legacy jellies
      jellyItems.forEach(jelly => {
        addItem(0, jelly.productName || "Geleia", jelly.quantity, "unidade", Number(jelly.unitPrice), 0);
      });

      return Object.values(consolidation);
    }),
});
