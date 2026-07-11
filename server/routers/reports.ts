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

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const allOrders = await db.select({
      id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus,
      totalAmount: orders.totalAmount, createdAt: orders.createdAt,
      isInternal: customers.isInternal,
    })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id));

    // Pedidos de clientes internos (ex: "Integrarte - Estoque") não são vendas reais —
    // continuam contando na produção, mas ficam fora de faturamento/contagem de vendas.
    const activeOrders = allOrders.filter(o => o.status !== "cancelled" && !o.isInternal);

    const todayOrders = activeOrders.filter(o => o.createdAt >= today && o.createdAt < tomorrow);
    const weekOrders = activeOrders.filter(o => o.createdAt >= weekStart);
    const monthOrders = activeOrders.filter(o => o.createdAt >= monthStart);

    const pendingPayments = allOrders.filter(o => o.status === "delivered" && !o.isInternal && (o.paymentStatus === "pending" || o.paymentStatus === "partial"));
    const inProduction = allOrders.filter(o => o.status === "production");
    const inRoute = allOrders.filter(o => o.status === "in_route");
    const packaged = allOrders.filter(o => o.status === "packaged");

    const sum = (list: typeof allOrders) => list.reduce((acc, o) => acc + parseFloat(o.totalAmount), 0);

    const pendingAmount = sum(pendingPayments);
    const todayRevenue = sum(todayOrders);
    const weekRevenue = sum(weekOrders);
    const monthRevenue = sum(monthOrders);
    const totalRevenue = sum(activeOrders);

    const deliveryUsers = await db.select().from(users).where(eq(users.role, "delivery"));

    const recentOrdersRaw = await db.select({
      id: orders.id, status: orders.status, totalAmount: orders.totalAmount,
      createdAt: orders.createdAt, customerName: customers.name,
    })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .orderBy(desc(orders.createdAt))
      .limit(8);

    return {
      todayOrdersCount: todayOrders.length,
      todayRevenue,
      weekOrdersCount: weekOrders.length,
      weekRevenue,
      monthOrdersCount: monthOrders.length,
      monthRevenue,
      totalOrders: activeOrders.length,
      totalRevenue,
      pendingPaymentsCount: pendingPayments.length,
      pendingAmount,
      inProductionCount: inProduction.length,
      inRouteCount: inRoute.length,
      packagedCount: packaged.length,
      deliveryUsersCount: deliveryUsers.length,
      recentOrders: recentOrdersRaw,
    };
  }),

  // ─── SALES REPORT ────────────────────────────────────────────────────────────
  sales: adminOrLauncherProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const from = new Date(input.dateFrom + "T00:00:00");
      const to = new Date(input.dateTo + "T23:59:59");

      // Pedidos no período (por data de entrega, ou criação se não houver data de entrega),
      // sempre excluindo cancelados e pedidos de clientes internos (ex: "Integrarte - Estoque",
      // que não são vendas reais).
      const orderRows = await db.select({
        id: orders.id, totalAmount: orders.totalAmount,
        launcherId: orders.launcherId, launcherName: users.name,
      })
        .from(orders)
        .leftJoin(users, eq(orders.launcherId, users.id))
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(
          sql`${orders.status} != 'cancelled'`,
          sql`(${customers.isInternal} = false OR ${customers.isInternal} IS NULL)`,
          or(
            and(gte(orders.deliveryDate, from), lte(orders.deliveryDate, to)),
            and(isNull(orders.deliveryDate), gte(orders.createdAt, from), lte(orders.createdAt, to))
          )
        ));

      const totalRevenue = orderRows.reduce((acc, o) => acc + parseFloat(o.totalAmount), 0);
      const totalOrders = orderRows.length;
      const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Vendas por vendedor
      const byLauncherMap: Record<number, { name: string; count: number; total: number }> = {};
      for (const o of orderRows) {
        const id = o.launcherId ?? 0;
        if (!byLauncherMap[id]) byLauncherMap[id] = { name: o.launcherName ?? "Desconhecido", count: 0, total: 0 };
        byLauncherMap[id].count += 1;
        byLauncherMap[id].total += parseFloat(o.totalAmount);
      }
      const byLauncher = Object.values(byLauncherMap).sort((a, b) => b.total - a.total);

      if (orderRows.length === 0) {
        return { totalRevenue: 0, totalOrders: 0, avgTicket: 0, byLauncher: [], topProducts: [] };
      }

      const orderIds = orderRows.map(o => o.id);

      // Produtos mais vendidos (produtos comuns + minipizzas + geleias, consolidados por nome)
      const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {};

      const itemRows = await db.select({
        productName: products.name, quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
      }).from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));
      for (const it of itemRows) {
        const name = it.productName ?? "Produto";
        if (!productMap[name]) productMap[name] = { name, quantity: 0, revenue: 0 };
        productMap[name].quantity += it.quantity;
        productMap[name].revenue += it.quantity * parseFloat(it.unitPrice);
      }

      const mpRows = await db.select({
        typeName: minipizzaTypes.name, quantity: orderMinipizzas.quantity,
        unitPrice: orderMinipizzas.unitPrice,
      }).from(orderMinipizzas)
        .leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
        .where(inArray(orderMinipizzas.orderId, orderIds));
      for (const mp of mpRows) {
        const name = `Minipizza ${mp.typeName ?? "—"}`;
        if (!productMap[name]) productMap[name] = { name, quantity: 0, revenue: 0 };
        productMap[name].quantity += mp.quantity;
        productMap[name].revenue += mp.quantity * parseFloat(mp.unitPrice);
      }

      const jRows = await db.select({
        flavorName: jellyFlavors.name, quantity: orderJellies.quantity,
        unitPrice: orderJellies.unitPrice,
      }).from(orderJellies)
        .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
        .where(inArray(orderJellies.orderId, orderIds));
      for (const j of jRows) {
        const name = `Geleia ${j.flavorName ?? "—"}`;
        if (!productMap[name]) productMap[name] = { name, quantity: 0, revenue: 0 };
        productMap[name].quantity += j.quantity;
        productMap[name].revenue += j.quantity * parseFloat(j.unitPrice);
      }

      const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);

      return { totalRevenue, totalOrders, avgTicket, byLauncher, topProducts };
    }),

  // ─── DELIVERY REPORT ─────────────────────────────────────────────────────────
  deliveries: adminOrLauncherProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const from = new Date(input.dateFrom + "T00:00:00");
      const to = new Date(input.dateTo + "T23:59:59");

      const orderRows = await db.select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(and(
          sql`${orders.status} != 'cancelled'`,
          or(
            and(gte(orders.deliveryDate, from), lte(orders.deliveryDate, to)),
            and(isNull(orders.deliveryDate), gte(orders.createdAt, from), lte(orders.createdAt, to))
          )
        ));

      const totalOrders = orderRows.length;
      const deliveredCount = orderRows.filter(o => o.status === "delivered" || o.status === "paid").length;
      const deliveryRate = totalOrders > 0 ? (deliveredCount / totalOrders) * 100 : 0;

      let byDeliverer: { name: string; count: number }[] = [];
      if (orderRows.length > 0) {
        const orderIds = orderRows.map(o => o.id);
        const records = await db.select({
          delivererName: users.name,
        }).from(deliveryRecords)
          .leftJoin(users, eq(deliveryRecords.deliveryUserId, users.id))
          .where(inArray(deliveryRecords.orderId, orderIds));

        const map: Record<string, number> = {};
        for (const r of records) {
          const name = r.delivererName ?? "Desconhecido";
          map[name] = (map[name] ?? 0) + 1;
        }
        byDeliverer = Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
      }

      return { totalOrders, deliveredCount, deliveryRate, byDeliverer };
    }),

  // ─── FINANCIAL REPORT ────────────────────────────────────────────────────────
  financial: adminOrLauncherProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const from = new Date(input.dateFrom + "T00:00:00");
      const to = new Date(input.dateTo + "T23:59:59");

      // Recebimentos efetivos no período (baseado em quando o pagamento foi registrado)
      const paymentRows = await db.select({
        amount: paymentRecords.amount, paymentMethod: paymentRecords.paymentMethod,
      }).from(paymentRecords)
        .where(and(gte(paymentRecords.paidAt, from), lte(paymentRecords.paidAt, to)));

      let pixReceived = 0;
      let cashReceived = 0;
      for (const p of paymentRows) {
        const amt = parseFloat(p.amount);
        if (p.paymentMethod === "pix") pixReceived += amt;
        else cashReceived += amt;
      }
      const totalReceived = pixReceived + cashReceived;

      // Pedidos entregues com pagamento pendente ou parcial (ainda falta receber)
      const pendingOrders = await db.select({
        id: orders.id, totalAmount: orders.totalAmount,
        customerName: customers.name,
      }).from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(
          or(eq(orders.paymentStatus, "pending"), eq(orders.paymentStatus, "partial")),
          eq(orders.status, "delivered"),
          sql`(${customers.isInternal} = false OR ${customers.isInternal} IS NULL)`
        ));

      const totalPending = pendingOrders.reduce((acc, o) => acc + parseFloat(o.totalAmount), 0);

      return { totalReceived, pixReceived, cashReceived, totalPending, pendingOrders };
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
        items: Record<string, { 
          name: string, 
          quantity: number, 
          unit: string, 
          revenue: number, 
          cost: number, 
          profit: number, 
          flavors: Record<string, number>,
          combinations: Record<string, number> 
        }> 
      }> = {};

      // Helper to add item to consolidation
      const addItem = (sId: number, name: string, qty: number, unit: string, unitPrice: number, unitCost: number, flavors: string[] = []) => {
        if (!consolidation[sId]) consolidation[sId] = { supplierId: sId, totalCost: 0, totalRevenue: 0, totalProfit: 0, items: {} };
        if (!consolidation[sId].items[name]) {
          consolidation[sId].items[name] = { name, quantity: 0, unit, revenue: 0, cost: 0, profit: 0, flavors: {}, combinations: {} };
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

        // Individual flavor counts (legacy)
        flavors.forEach(fName => {
          consolidation[sId].items[name].flavors[fName] = 
            (consolidation[sId].items[name].flavors[fName] || 0) + qty;
        });

        // Exact combinations grouping
        const combinationKey = flavors.length > 0 ? flavors.sort().join(" & ") : "Sem sabores";
        consolidation[sId].items[name].combinations[combinationKey] = 
          (consolidation[sId].items[name].combinations[combinationKey] || 0) + qty;
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
