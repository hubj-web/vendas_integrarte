import { TRPCError } from "@trpc/server";
import { eq, and, gte, lte, desc, sql, count, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import PDFDocument from "pdfkit";
import {
  orders, orderItems, orderMinipizzas, orderJellies,
  customers, users, deliveryRecords, paymentRecords,
  products, minipizzaTypes, minipizzaFlavors, jellyFlavors,
  orderItemFlavors, orderMinipizzaFlavors, productCategories,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const adminOrLauncherProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role === "delivery") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

async function computeFinancialReport(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom + "T00:00:00");
  const to = new Date(dateTo + "T23:59:59");

  // Recebimentos efetivos no período, faturamento do período e pendências —
  // são consultas independentes entre si, então rodam em paralelo (mais rápido
  // e reduz o risco de timeout numa conexão mais lenta).
  const [paymentRows, orderRows, pendingOrders] = await Promise.all([
    db.select({
      amount: paymentRecords.amount, paymentMethod: paymentRecords.paymentMethod,
    }).from(paymentRecords)
      .where(and(gte(paymentRecords.paidAt, from), lte(paymentRecords.paidAt, to))),

    db.select({
      id: orders.id, totalAmount: orders.totalAmount,
    })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(
        sql`${orders.status} != 'cancelled'`,
        sql`(${customers.isInternal} = false OR ${customers.isInternal} IS NULL)`,
        or(
          and(gte(orders.deliveryDate, from), lte(orders.deliveryDate, to)),
          and(isNull(orders.deliveryDate), gte(orders.createdAt, from), lte(orders.createdAt, to))
        )
      )),

    db.select({
      id: orders.id, totalAmount: orders.totalAmount,
      customerName: customers.name,
    }).from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(
        or(eq(orders.paymentStatus, "pending"), eq(orders.paymentStatus, "partial")),
        eq(orders.status, "delivered"),
        sql`(${customers.isInternal} = false OR ${customers.isInternal} IS NULL)`
      )),
  ]);

  let pixReceived = 0;
  let cashReceived = 0;
  for (const p of paymentRows) {
    const amt = parseFloat(p.amount);
    if (p.paymentMethod === "pix") pixReceived += amt;
    else cashReceived += amt;
  }
  const totalReceived = pixReceived + cashReceived;

  const totalRevenue = orderRows.reduce((acc, o) => acc + parseFloat(o.totalAmount), 0);
  const totalPending = pendingOrders.reduce((acc, o) => acc + parseFloat(o.totalAmount), 0);

  // Custo e lucro por categoria. Protegido com try/catch: se essa parte falhar por
  // algum motivo (ex: dado inconsistente), o resto do relatório (recebido, pendente
  // etc.) ainda é retornado normalmente, em vez de quebrar a tela inteira.
  let totalCost = 0;
  let profitByCategory: { category: string; revenue: number; cost: number; profit: number }[] = [];

  try {
    if (orderRows.length > 0) {
      const orderIds = orderRows.map(o => o.id);
      const categoryMap: Record<string, { category: string; revenue: number; cost: number }> = {};
      const addToCategory = (category: string, revenue: number, cost: number) => {
        if (!categoryMap[category]) categoryMap[category] = { category, revenue: 0, cost: 0 };
        categoryMap[category].revenue += revenue;
        categoryMap[category].cost += cost;
      };

      const [itemRows, mpRows, jRows] = await Promise.all([
        db.select({
          quantity: orderItems.quantity, unitPrice: orderItems.unitPrice, cost: products.cost,
          categoryName: productCategories.name,
        }).from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
          .where(inArray(orderItems.orderId, orderIds)),

        db.select({
          quantity: orderMinipizzas.quantity, unitPrice: orderMinipizzas.unitPrice, cost: minipizzaTypes.cost,
        }).from(orderMinipizzas)
          .leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
          .where(inArray(orderMinipizzas.orderId, orderIds)),

        db.select({
          quantity: orderJellies.quantity, unitPrice: orderJellies.unitPrice, cost: jellyFlavors.cost,
        }).from(orderJellies)
          .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
          .where(inArray(orderJellies.orderId, orderIds)),
      ]);

      for (const it of itemRows) {
        const cost = it.quantity * parseFloat(it.cost ?? "0");
        const revenue = it.quantity * parseFloat(it.unitPrice ?? "0");
        totalCost += cost;
        addToCategory(it.categoryName ?? "Sem Categoria", revenue, cost);
      }
      for (const mp of mpRows) {
        const cost = mp.quantity * parseFloat(mp.cost ?? "0");
        const revenue = mp.quantity * parseFloat(mp.unitPrice ?? "0");
        totalCost += cost;
        addToCategory("Minipizzas", revenue, cost);
      }
      for (const j of jRows) {
        const cost = j.quantity * parseFloat(j.cost ?? "0");
        const revenue = j.quantity * parseFloat(j.unitPrice ?? "0");
        totalCost += cost;
        addToCategory("Geleias", revenue, cost);
      }

      profitByCategory = Object.values(categoryMap)
        .map(c => ({ ...c, profit: c.revenue - c.cost }))
        .sort((a, b) => b.profit - a.profit);
    }
  } catch (err) {
    console.error("[Relatório Financeiro] Falha ao calcular custo/lucro por categoria:", err);
    // Segue com totalCost = 0 e profitByCategory = [] — o resto do relatório continua íntegro.
  }

  const profit = totalRevenue - totalCost;

  return { totalReceived, pixReceived, cashReceived, totalPending, pendingOrders, totalRevenue, totalCost, profit, profitByCategory };
}

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

    // Considera tanto usuários com role principal "delivery" quanto os que têm
    // "delivery" como uma das funções adicionais (campo roles, JSON), e só os ativos.
    const allUsers = await db.select({ role: users.role, roles: users.roles, active: users.active }).from(users);
    const deliveryUsersCount = allUsers.filter(u => {
      if (!u.active) return false;
      if (u.role === "delivery") return true;
      try {
        const parsed = JSON.parse(u.roles ?? "[]");
        return Array.isArray(parsed) && parsed.includes("delivery");
      } catch {
        return false;
      }
    }).length;

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
      deliveryUsersCount,
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

      return { totalOrders, deliveredCount, deliveryRate, byDeliverer, activeDeliverersCount: byDeliverer.length };
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
      const startedAt = Date.now();
      try {
        const result = await computeFinancialReport(db, input.dateFrom, input.dateTo);
        console.log(`[Relatório Financeiro] OK em ${Date.now() - startedAt}ms (período ${input.dateFrom} a ${input.dateTo})`);
        return result;
      } catch (err) {
        console.error(`[Relatório Financeiro] ERRO após ${Date.now() - startedAt}ms:`, err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? `Falha ao gerar relatório financeiro: ${err.message}` : "Falha ao gerar relatório financeiro.",
        });
      }
    }),

  financialPdf: adminOrLauncherProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const report = await computeFinancialReport(db, input.dateFrom, input.dateTo);
      const fmtMoney = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
      const fmtDate = (d: string) => {
        const [y, m, day] = d.split("-");
        return `${day}/${m}/${y}`;
      };

      return new Promise<{ base64: string; filename: string; mimeType: string }>((resolve, reject) => {
        const doc = new PDFDocument({
          size: "A4", margin: 40,
          info: { Title: "Relatório Financeiro - Integrarte", Author: "Sistema Integrarte" },
        });

        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            base64: buffer.toString("base64"),
            filename: `financeiro_${input.dateFrom}_a_${input.dateTo}.pdf`,
            mimeType: "application/pdf",
          });
        });
        doc.on("error", reject);

        const green = "#2D6A4F";
        const red = "#C0392B";
        const mutedText = "#555555";
        const pageWidth = doc.page.width - 80;

        // Cabeçalho
        doc.rect(40, 40, pageWidth, 46).fill(green);
        doc.fillColor("#FFFFFF").fontSize(16).font("Helvetica-Bold")
          .text("Relatório Financeiro — Integrarte", 50, 52, { width: pageWidth - 20 });
        doc.fontSize(9).font("Helvetica")
          .text(`Período: ${fmtDate(input.dateFrom)} a ${fmtDate(input.dateTo)}   |   Gerado em: ${new Date().toLocaleString("pt-BR")}`,
            50, 72, { width: pageWidth - 20 });

        let y = 105;

        // Cards de resumo (2 colunas x 3 linhas)
        const cards = [
          { label: "Total Recebido", value: report.totalReceived },
          { label: "Recebido em PIX", value: report.pixReceived },
          { label: "Recebido em Dinheiro", value: report.cashReceived },
          { label: "Pendente de Pagamento", value: report.totalPending },
          { label: "Custo (período vendido)", value: report.totalCost },
          { label: "Lucro", value: report.profit, highlight: true },
        ];

        const cardW = (pageWidth - 20) / 2;
        cards.forEach((card, idx) => {
          const col = idx % 2;
          const row = Math.floor(idx / 2);
          const x = 40 + col * (cardW + 20);
          const cardY = y + row * 55;

          doc.roundedRect(x, cardY, cardW, 45, 4).strokeColor("#DDDDDD").lineWidth(1).stroke();
          doc.fillColor(mutedText).fontSize(8).font("Helvetica").text(card.label, x + 10, cardY + 8);
          doc.fillColor(card.highlight ? (card.value >= 0 ? green : red) : "#1B1B1B")
            .fontSize(14).font("Helvetica-Bold")
            .text(fmtMoney(card.value), x + 10, cardY + 20);
        });

        y += Math.ceil(cards.length / 2) * 55 + 15;

        if (report.totalRevenue > 0) {
          const margin = (report.profit / report.totalRevenue) * 100;
          doc.fillColor(mutedText).fontSize(9).font("Helvetica")
            .text(`Faturamento do período: ${fmtMoney(report.totalRevenue)}   |   Margem de lucro: ${margin.toFixed(1)}%`, 40, y);
          y += 25;
        }

        // Tabela: Lucro por categoria
        if (report.profitByCategory.length > 0) {
          doc.fillColor("#1B1B1B").fontSize(12).font("Helvetica-Bold").text("Lucro por Categoria", 40, y);
          y += 20;

          const cols = [
            { label: "Categoria", width: pageWidth * 0.28 },
            { label: "Faturamento", width: pageWidth * 0.18 },
            { label: "Custo", width: pageWidth * 0.18 },
            { label: "Lucro", width: pageWidth * 0.18 },
            { label: "Margem", width: pageWidth * 0.18 },
          ];

          doc.rect(40, y, pageWidth, 18).fill(green);
          let x = 40;
          doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
          for (const col of cols) {
            doc.text(col.label, x + 4, y + 5, { width: col.width - 8 });
            x += col.width;
          }
          y += 18;

          for (const cat of report.profitByCategory) {
            if (y > doc.page.height - 60) { doc.addPage(); y = 40; }
            const margin = cat.revenue > 0 ? (cat.profit / cat.revenue) * 100 : 0;
            x = 40;
            doc.rect(40, y, pageWidth, 18).fillAndStroke("#FFFFFF", "#EEEEEE");
            doc.fillColor("#1B1B1B").fontSize(8).font("Helvetica");
            const rowValues = [cat.category, fmtMoney(cat.revenue), fmtMoney(cat.cost), fmtMoney(cat.profit), `${margin.toFixed(0)}%`];
            rowValues.forEach((val, i) => {
              doc.fillColor(i === 3 ? (cat.profit >= 0 ? green : red) : "#1B1B1B");
              doc.text(val, x + 4, y + 5, { width: cols[i].width - 8 });
              x += cols[i].width;
            });
            y += 18;
          }
        }

        doc.end();
      });
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
