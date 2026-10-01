import { TRPCError } from "@trpc/server";
import { eq, desc, and, gte, lte, like, or, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  customers, orders, orderItems, orderItemFlavors, orderMinipizzas, orderMinipizzaFlavors,
  orderJellies, orderStatusHistory, products, productFlavors, minipizzaTypes, minipizzaFlavors,
  jellyFlavors, deliveryMethods, users, deliveryRecords, paymentRecords, routeOrders, deliveryRoutes,
  storeEvents, storeOrderPayments, orderItemVariationSelections, estoqueAtual, estoqueAtualFlavors,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { googleSheets } from "../google-sheets";
import { uploadReceiptToDrive } from "../google-drive";
import { sendOrderNotification } from "../telegram";
import { isProductOnPreOrder } from "../storeHelpers";
import { nextTicketNumber } from "./publicStore";

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────
const customersAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

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

  list: customersAdminProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().default(25),
      query: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const { page, pageSize, query } = input;
      const where = query
        ? or(like(customers.name, `%${query}%`), like(customers.phone, `%${query}%`))
        : undefined;

      const [items, totalRows] = await Promise.all([
        db.select().from(customers)
          .where(where)
          .orderBy(customers.name)
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ count: sql<number>`count(*)` }).from(customers).where(where),
      ]);

      return { items, total: Number(totalRows[0]?.count ?? 0) };
    }),

  getById: customersAdminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [customer] = await db.select().from(customers).where(eq(customers.id, input.id));
      const [orderCount] = await db.select({ count: sql<number>`count(*)` })
        .from(orders).where(eq(orders.customerId, input.id));
      return customer ? { ...customer, orderCount: Number(orderCount?.count ?? 0) } : null;
    }),

  delete: customersAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [orderCount] = await db.select({ count: sql<number>`count(*)` })
        .from(orders).where(eq(orders.customerId, input.id));
      if (Number(orderCount?.count ?? 0) > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não é possível excluir: este cliente possui pedidos vinculados. Mantenha o cadastro para preservar o histórico.",
        });
      }
      await db.delete(customers).where(eq(customers.id, input.id));
      return { success: true };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      phone: z.string().min(8),
      locationReference: z.string().optional(),
      customerReference: z.string().optional(),
      street: z.string().optional(),
      number: z.string().optional(),
      complement: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      zipCode: z.string().optional(),
      isInternal: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.insert(customers).values(input);
      return { success: true, id: Number((result as any)[0].insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      phone: z.string().optional(),
      locationReference: z.string().optional(),
      customerReference: z.string().optional(),
      street: z.string().optional(),
      number: z.string().optional(),
      complement: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      zipCode: z.string().optional(),
      isInternal: z.boolean().optional(),
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
  flavorIds: z.array(z.number()).optional(),
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

export const ordersRouter = router({
  customers: customersRouter,
  list: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().default(25),
      status: z.string().optional(),
      statusIn: z.array(z.string()).optional(),
      paymentStatus: z.string().optional(),
      launcherId: z.number().optional(),
      deliveryMethodId: z.number().optional(),
      routeId: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      search: z.string().optional(),
      // Visões prontas — cada uma aplica um combo de filtros pronto, sem o
      // usuário precisar montar manualmente.
      view: z.enum([
        "all", "periodo", "loja_eventos", "aguardando_pagamento",
        "para_produzir", "para_empacotar", "retiradas_hoje", "em_atraso",
      ]).optional(),
      channel: z.enum(["periodo", "loja_publica", "vendedor_evento"]).optional(),
      eventId: z.union([z.number(), z.literal("regular")]).optional(),
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
        routeId: routeOrders.routeId,
        routePosition: routeOrders.position,
        channel: orders.channel,
        eventId: orders.eventId,
        eventName: storeEvents.name,
        ticketNumber: orders.ticketNumber,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(users, eq(orders.launcherId, users.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .leftJoin(routeOrders, eq(orders.id, routeOrders.orderId))
        .leftJoin(storeEvents, eq(orders.eventId, storeEvents.id))
        .orderBy(desc(orders.createdAt));

      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
      const tresDiasAtras = new Date(hoje); tresDiasAtras.setDate(tresDiasAtras.getDate() - 3);

      // Filter
      let filtered = allOrders.filter(o => {
        if (ctx.user.role === "delivery") {
          // Entregadores só veem pedidos em rota ou entregues
          if (!["in_route", "packaged", "delivered"].includes(o.status)) return false;
        }
        if (input?.status && o.status !== input.status) return false;
        if (input?.statusIn && input.statusIn.length > 0 && !input.statusIn.includes(o.status)) return false;
        if (input?.paymentStatus && o.paymentStatus !== input.paymentStatus) return false;
        if (input?.launcherId && o.launcherId !== input.launcherId) return false;
        if (input?.deliveryMethodId && o.deliveryMethodId !== input.deliveryMethodId) return false;
        if (input?.routeId && o.routeId !== input.routeId) return false;
        if (input?.channel && o.channel !== input.channel) return false;
        if (input?.eventId === "regular" && o.eventId != null) return false;
        if (typeof input?.eventId === "number" && o.eventId !== input.eventId) return false;

        // Visões prontas
        switch (input?.view) {
          case "periodo":
            if (o.channel !== "periodo") return false;
            break;
          case "loja_eventos":
            if (o.channel !== "loja_publica" && o.channel !== "vendedor_evento") return false;
            break;
          case "aguardando_pagamento":
            if (o.paymentStatus === "paid" || o.status === "cancelled") return false;
            break;
          case "para_produzir":
            if (o.status !== "production" && o.status !== "received") return false;
            break;
          case "para_empacotar":
            if (o.status !== "production" && o.status !== "received" && o.status !== "packaged") return false;
            break;
          case "retiradas_hoje": {
            if (!o.deliveryMethodId) return false;
            const dt = o.deliveryDate ? new Date(o.deliveryDate) : null;
            if (!dt || dt < hoje || dt >= amanha) return false;
            break;
          }
          case "em_atraso": {
            if (["delivered", "paid", "cancelled"].includes(o.status)) return false;
            const created = new Date(o.createdAt);
            if (created >= tresDiasAtras) return false;
            break;
          }
        }

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

      // Quando filtrando por uma rota específica, ordena pela posição definida na rota
      // (a ordem real de visitação), em vez da ordem padrão por data de criação.
      if (input?.routeId) {
        filtered = filtered.sort((a, b) => (a.routePosition ?? 0) - (b.routePosition ?? 0));
      }

      const total = filtered.length;
      const data = filtered.slice(offset, offset + pageSize);

      // Fetch products for each order in the page
      const orderIds = data.map(o => o.id);
      const productSummaryMap: Record<number, string> = {};
      const productListMap: Record<number, string[]> = {};

      if (orderIds.length > 0) {
        // Fetch order items with flavors
        const allOrderItems = await db.select({
          id: orderItems.id, orderId: orderItems.orderId, productName: products.name,
          quantity: orderItems.quantity,
        }).from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .where(inArray(orderItems.orderId, orderIds));

        const allOrderItemIds = allOrderItems.map(i => i.id);
        const flavorMap: Record<number, string[]> = {};
        if (allOrderItemIds.length > 0) {
          const flavorRows = await db.select({
            orderItemId: orderItemFlavors.orderItemId, flavorName: orderItemFlavors.flavorName,
          }).from(orderItemFlavors).where(inArray(orderItemFlavors.orderItemId, allOrderItemIds));
          for (const f of flavorRows) {
            if (!flavorMap[f.orderItemId]) flavorMap[f.orderItemId] = [];
            flavorMap[f.orderItemId].push(f.flavorName);
          }
        }

        // Build product names per order
        const productNamesMap: Record<number, string[]> = {};
        for (const item of allOrderItems) {
          if (!productNamesMap[item.orderId]) productNamesMap[item.orderId] = [];
          const flavors = flavorMap[item.id] ?? [];
          const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
          productNamesMap[item.orderId].push(`${item.quantity} ${item.productName}${flavorStr}`);
        }

        // Fetch minipizzas
        const mpRows = await db.select({
          id: orderMinipizzas.id, orderId: orderMinipizzas.orderId,
          typeName: minipizzaTypes.name, quantity: orderMinipizzas.quantity,
        }).from(orderMinipizzas)
          .leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
          .where(inArray(orderMinipizzas.orderId, orderIds));

        const mpIds = mpRows.map(m => m.id);
        const mpFlavorMap: Record<number, string[]> = {};
        if (mpIds.length > 0) {
          const flavorRows = await db.select({
            orderMinipizzaId: orderMinipizzaFlavors.orderMinipizzaId,
            flavorName: minipizzaFlavors.name,
          }).from(orderMinipizzaFlavors)
            .leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
            .where(inArray(orderMinipizzaFlavors.orderMinipizzaId, mpIds));
          for (const f of flavorRows) {
            if (!mpFlavorMap[f.orderMinipizzaId]) mpFlavorMap[f.orderMinipizzaId] = [];
            mpFlavorMap[f.orderMinipizzaId].push(f.flavorName ?? "");
          }
        }

        for (const mp of mpRows) {
          if (!productNamesMap[mp.orderId]) productNamesMap[mp.orderId] = [];
          const flavors = mpFlavorMap[mp.id] ?? [];
          const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
          productNamesMap[mp.orderId].push(`${mp.quantity} Minipizza ${mp.typeName ?? "—"}${flavorStr}`);
        }

        // Fetch jellies
        const jRows = await db.select({
          orderId: orderJellies.orderId, flavorName: jellyFlavors.name, quantity: orderJellies.quantity,
        }).from(orderJellies)
          .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
          .where(inArray(orderJellies.orderId, orderIds));

        for (const j of jRows) {
          if (!productNamesMap[j.orderId]) productNamesMap[j.orderId] = [];
          productNamesMap[j.orderId].push(`${j.quantity} Geleia ${j.flavorName}`);
        }

        for (const order of data) {
          productSummaryMap[order.id] = productNamesMap[order.id]?.join(", ") ?? "—";
          productListMap[order.id] = productNamesMap[order.id] ?? [];
        }
      }

      // Enrich data with products
      const enrichedData = data.map(o => ({
        ...o,
        productSummary: productSummaryMap[o.id] ?? "—",
        productList: productListMap[o.id] ?? [],
      }));

      return { data: enrichedData, total };
    }),

  /**
   * Soma a quantidade vendida de cada produto, dentro do mesmo filtro da
   * lista acima (view/canal/evento/status) — pra responder "quantos
   * ingressos, quantos marmitex" sem contar pedido por pedido. Não pagina —
   * soma em cima de todos os pedidos que baterem com o filtro.
   */
  productSummary: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      paymentStatus: z.string().optional(),
      view: z.enum([
        "all", "periodo", "loja_eventos", "aguardando_pagamento",
        "para_produzir", "para_empacotar", "retiradas_hoje", "em_atraso",
      ]).optional(),
      channel: z.enum(["periodo", "loja_publica", "vendedor_evento"]).optional(),
      eventId: z.union([z.number(), z.literal("regular")]).optional(),
      search: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const allOrders = await db.select({
        id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus,
        channel: orders.channel, eventId: orders.eventId, createdAt: orders.createdAt,
        customerName: customers.name, customerPhone: customers.phone,
      }).from(orders).leftJoin(customers, eq(orders.customerId, customers.id));

      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const tresDiasAtras = new Date(hoje); tresDiasAtras.setDate(tresDiasAtras.getDate() - 3);

      const filtered = allOrders.filter(o => {
        if (ctx.user.role === "delivery" && !["in_route", "packaged", "delivered"].includes(o.status)) return false;
        if (input?.status && o.status !== input.status) return false;
        if (input?.paymentStatus && o.paymentStatus !== input.paymentStatus) return false;
        if (input?.channel && o.channel !== input.channel) return false;
        if (input?.eventId === "regular" && o.eventId != null) return false;
        if (typeof input?.eventId === "number" && o.eventId !== input.eventId) return false;
        switch (input?.view) {
          case "periodo": if (o.channel !== "periodo") return false; break;
          case "loja_eventos": if (o.channel !== "loja_publica" && o.channel !== "vendedor_evento") return false; break;
          case "aguardando_pagamento": if (o.paymentStatus === "paid" || o.status === "cancelled") return false; break;
          case "para_produzir": if (o.status !== "production" && o.status !== "received") return false; break;
          case "para_empacotar": if (o.status !== "production" && o.status !== "received" && o.status !== "packaged") return false; break;
          case "em_atraso": {
            if (["delivered", "paid", "cancelled"].includes(o.status)) return false;
            if (new Date(o.createdAt) >= tresDiasAtras) return false;
            break;
          }
        }
        if (input?.search) {
          const s = input.search.toLowerCase();
          if (!o.customerName?.toLowerCase().includes(s) && !o.customerPhone?.includes(s)) return false;
        }
        if (input?.dateFrom && o.createdAt < new Date(input.dateFrom)) return false;
        if (input?.dateTo) {
          const to = new Date(input.dateTo); to.setHours(23, 59, 59);
          if (o.createdAt > to) return false;
        }
        return true;
      });
      if (filtered.length === 0) return [];

      const itemRows = await db.select({
        productId: orderItems.productId, productName: products.name, quantity: orderItems.quantity,
      }).from(orderItems).leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, filtered.map(o => o.id)));

      const totals = new Map<number, { productId: number; productName: string; totalQuantity: number }>();
      for (const it of itemRows) {
        const current = totals.get(it.productId) ?? { productId: it.productId, productName: it.productName ?? "Produto removido", totalQuantity: 0 };
        current.totalQuantity += it.quantity;
        totals.set(it.productId, current);
      }
      return Array.from(totals.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
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
        customerNumber: customers.number, customerComplement: customers.complement,
        customerNeighborhood: customers.neighborhood,
        customerCity: customers.city, customerLocationRef: customers.locationReference,
        launcherId: orders.launcherId, launcherName: users.name,
        deliveryMethodId: orders.deliveryMethodId, deliveryMethodName: deliveryMethods.name,
        eventId: orders.eventId, ticketCode: orders.ticketCode, ticketNumber: orders.ticketNumber,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(users, eq(orders.launcherId, users.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .where(eq(orders.id, input.id))
        .limit(1);

      if (!orderRows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      const order = orderRows[0];

      const itemRows = await db.select({
        id: orderItems.id, quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice, subtotal: orderItems.subtotal,
        productId: orderItems.productId, productName: products.name, unit: products.unit,
      }).from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, input.id));

      const items = await Promise.all(itemRows.map(async it => {
        const flavors = await db.select({ productFlavorId: orderItemFlavors.productFlavorId, name: productFlavors.name })
          .from(orderItemFlavors)
          .leftJoin(productFlavors, eq(orderItemFlavors.productFlavorId, productFlavors.id))
          .where(eq(orderItemFlavors.orderItemId, it.id));
        return { ...it, flavors };
      }));

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

  /**
   * Troca o produto de um item já vendido (ex: virou Marmitex em Ingresso),
   * mantendo (ou ajustando) o preço que o cliente já pagou — não o preço
   * normal do produto novo. Devolve ao estoque automaticamente se o produto
   * antigo não era sob encomenda; se o produto novo pertencer a um evento
   * de ingresso e o pedido ainda não tiver número, gera um novo.
   */
  swapItemProduct: adminProcedure
    .input(z.object({
      orderItemId: z.number(),
      newProductId: z.number(),
      newUnitPrice: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [item] = await db.select().from(orderItems).where(eq(orderItems.id, input.orderItemId)).limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });

      const [order] = await db.select().from(orders).where(eq(orders.id, item.orderId)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });

      const [oldProduct] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
      const [newProduct] = await db.select().from(products).where(eq(products.id, input.newProductId)).limit(1);
      if (!newProduct) throw new TRPCError({ code: "BAD_REQUEST", message: "Produto novo não encontrado." });

      const newSubtotal = (Number(input.newUnitPrice) * item.quantity).toFixed(2);

      // Devolve o produto antigo ao estoque, automaticamente, se ele não
      // era sob encomenda (se era, não tinha baixado estoque — não há o
      // que devolver).
      if (oldProduct && !isProductOnPreOrder(oldProduct)) {
        const oldFlavors = await db.select({ productFlavorId: orderItemFlavors.productFlavorId, flavorName: orderItemFlavors.flavorName })
          .from(orderItemFlavors).where(eq(orderItemFlavors.orderItemId, item.id));
        const flavorIds = oldFlavors.map(f => f.productFlavorId).filter((id): id is number => id != null).sort();

        const lotesExistentes = await db.select().from(estoqueAtual).where(eq(estoqueAtual.productId, item.productId));
        let loteAlvo: typeof lotesExistentes[number] | undefined;
        for (const lote of lotesExistentes) {
          const lf = await db.select({ productFlavorId: estoqueAtualFlavors.productFlavorId }).from(estoqueAtualFlavors).where(eq(estoqueAtualFlavors.estoqueAtualId, lote.id));
          const loteFlavorIds = lf.map(f => f.productFlavorId).sort();
          if (JSON.stringify(loteFlavorIds) === JSON.stringify(flavorIds)) { loteAlvo = lote; break; }
        }
        if (loteAlvo) {
          await db.update(estoqueAtual).set({ quantidade: loteAlvo.quantidade + item.quantity }).where(eq(estoqueAtual.id, loteAlvo.id));
        } else {
          const novoLote = await db.insert(estoqueAtual).values({ productId: item.productId, quantidade: item.quantity });
          const novoLoteId = Number((novoLote as any)[0]?.insertId ?? (novoLote as any).insertId);
          if (flavorIds.length > 0) {
            await db.insert(estoqueAtualFlavors).values(oldFlavors.filter(f => f.productFlavorId != null).map(f => ({ estoqueAtualId: novoLoteId, productFlavorId: f.productFlavorId!, flavorName: f.flavorName })));
          }
        }
      }

      // O item passa a ser do produto novo, com o preço informado (não o
      // preço de tabela do produto novo) — e perde os sabores antigos, já
      // que são de outro produto.
      await db.delete(orderItemFlavors).where(eq(orderItemFlavors.orderItemId, item.id));
      await db.update(orderItems).set({
        productId: input.newProductId,
        unitPrice: input.newUnitPrice,
        subtotal: newSubtotal,
      }).where(eq(orderItems.id, item.id));

      const novoTotal = (Number(order.totalAmount) - Number(item.subtotal) + Number(newSubtotal)).toFixed(2);
      await db.update(orders).set({ totalAmount: novoTotal }).where(eq(orders.id, order.id));

      // Se o produto novo é de um evento de ingresso e o pedido ainda não
      // tem número, gera o próximo da sequência agora.
      if (order.eventId && order.ticketNumber == null) {
        const [event] = await db.select().from(storeEvents).where(eq(storeEvents.id, order.eventId)).limit(1);
        if (event?.type === "ingresso") {
          const numero = await nextTicketNumber(db, order.eventId);
          await db.update(orders).set({ ticketNumber: numero }).where(eq(orders.id, order.id));
        }
      }

      return { success: true };
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
        status: "received",
        paymentStatus: "pending",
      });

      const orderId = Number((result as any).insertId || (result as any)[0]?.insertId);

      // Insert items
      for (const item of input.items) {
        const itemResult = await db.insert(orderItems).values({
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
        });
        const orderItemId = Number((itemResult as any).insertId || (itemResult as any)[0]?.insertId);
        
        if (item.flavorIds && item.flavorIds.length > 0) {
          // Buscar nomes dos sabores para desnormalização
          const flavors = await db.select({ id: productFlavors.id, name: productFlavors.name })
            .from(productFlavors)
            .where(inArray(productFlavors.id, item.flavorIds));

          await db.insert(orderItemFlavors).values(
            flavors.map(f => ({
              orderItemId,
              productFlavorId: f.id,
              flavorName: f.name,
            }))
          );
        }
      }

      // Insert minipizzas
      for (const mp of input.minipizzas) {
        const mpResult = await db.insert(orderMinipizzas).values({
          orderId, minipizzaTypeId: mp.minipizzaTypeId,
          quantity: mp.quantity, unitPrice: mp.unitPrice, subtotal: mp.subtotal,
        });
        const mpId = Number((mpResult as any).insertId || (mpResult as any)[0]?.insertId);
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

      // Async background task to append to Google Sheets
      if (googleSheets.isConfigured()) {
        try {
          // Fetch full order data for the sheet
          const [orderData] = await db.select({
            id: orders.id,
            createdAt: orders.createdAt,
            totalAmount: orders.totalAmount,
            paymentMethod: orders.paymentMethod,
            deliveryDate: orders.deliveryDate,
            deliveryAddress: orders.deliveryAddress,
            notes: orders.notes,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
            customerName: customers.name,
            customerPhone: customers.phone,
            customerNeighborhood: customers.neighborhood,
            customerCity: customers.city,
            launcherName: users.name,
            deliveryMethodName: deliveryMethods.name,
          })
            .from(orders)
            .leftJoin(customers, eq(orders.customerId, customers.id))
            .leftJoin(users, eq(orders.launcherId, users.id))
            .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
            .where(eq(orders.id, orderId))
            .limit(1);

          if (orderData) {
            // Build products string (similar to export logic)
            const productsList: string[] = [];
            
            // Items
            const items = await db.select({ 
              id: orderItems.id,
              name: products.name, 
              qty: orderItems.quantity 
            })
              .from(orderItems).leftJoin(products, eq(orderItems.productId, products.id))
              .where(eq(orderItems.orderId, orderId));
            
            for (const i of items) {
              const itemFlavors = await db.select({ name: productFlavors.name })
                .from(orderItemFlavors).leftJoin(productFlavors, eq(orderItemFlavors.productFlavorId, productFlavors.id))
                .where(eq(orderItemFlavors.orderItemId, i.id));
              
              const flavorsStr = itemFlavors.length > 0 ? ` [${itemFlavors.map(f => f.name).join(", ")}]` : "";
              productsList.push(`${i.name}${flavorsStr} (${i.qty}x)`);
            }

            // Minipizzas
            const mps = await db.select({ 
              id: orderMinipizzas.id,
              type: minipizzaTypes.name, 
              qty: orderMinipizzas.quantity 
            })
              .from(orderMinipizzas).leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
              .where(eq(orderMinipizzas.orderId, orderId));
            
            for (const m of mps) {
              const mpFlavors = await db.select({ name: minipizzaFlavors.name })
                .from(orderMinipizzaFlavors).leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
                .where(eq(orderMinipizzaFlavors.orderMinipizzaId, m.id));
              
              const flavorsStr = mpFlavors.length > 0 ? ` [${mpFlavors.map(f => f.name).join(", ")}]` : "";
              productsList.push(`Minipizza ${m.type}${flavorsStr} (${m.qty}x)`);
            }

            // Jellies
            const jellies = await db.select({ flavor: jellyFlavors.name, qty: orderJellies.quantity })
              .from(orderJellies).leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
              .where(eq(orderJellies.orderId, orderId));
            jellies.forEach(j => productsList.push(`Geleia ${j.flavor} (${j.qty}x)`));

            const fullOrder = {
              ...orderData,
              products: productsList.join("; ")
            };
            
            await googleSheets.appendOrder(fullOrder);
            await uploadReceiptToDrive(fullOrder);
            await sendOrderNotification(fullOrder);
          }
        } catch (error) {
          console.error("Error in background tasks (Sheets/Drive/Telegram):", error);
        }
      }

      return { success: true, orderId };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["received", "production", "in_route", "packaged", "delivered", "delivery_failed", "paid", "cancelled"]),
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

      // Idem: garante que o pagamento apareça no Relatório Financeiro
      if (input.status === "paid") {
        const [existing] = await db.select({ id: paymentRecords.id }).from(paymentRecords)
          .where(eq(paymentRecords.orderId, input.id)).limit(1);
        if (!existing) {
          await db.insert(paymentRecords).values({
            orderId: input.id,
            paymentMethod: current[0].paymentMethod as "cash" | "pix",
            amount: current[0].totalAmount,
            paidAt: new Date(),
            registeredBy: ctx.user.id,
            notes: "Registrado automaticamente ao marcar pedido como pago",
          });
        }
      }

      // Idem: garante que a entrega apareça no Relatório de Entregas (contagem de
      // entregadores ativos etc.) mesmo quando marcada por aqui em vez da tela
      // "Registrar Entrega". Usa o entregador da rota, se o pedido tiver uma; senão
      // atribui a quem marcou a entrega.
      if (input.status === "delivered") {
        const [existingDelivery] = await db.select({ id: deliveryRecords.id }).from(deliveryRecords)
          .where(eq(deliveryRecords.orderId, input.id)).limit(1);
        if (!existingDelivery) {
          const [routeInfo] = await db.select({ deliveryUserId: deliveryRoutes.deliveryUserId })
            .from(routeOrders)
            .leftJoin(deliveryRoutes, eq(routeOrders.routeId, deliveryRoutes.id))
            .where(eq(routeOrders.orderId, input.id)).limit(1);
          await db.insert(deliveryRecords).values({
            orderId: input.id,
            deliveryUserId: routeInfo?.deliveryUserId ?? ctx.user.id,
            deliveredAt: new Date(),
            notes: "Registrado automaticamente ao marcar pedido como entregue",
          });
        }
      }

      // Ao cancelar, o pedido deixa de fazer parte de qualquer rota de entrega
      // (senão continuaria aparecendo como parada, contando na distância e nos links do Maps).
      if (input.status === "cancelled") {
        await db.delete(routeOrders).where(eq(routeOrders.orderId, input.id));
      }

      return { success: true };
    }),

  updatePaymentStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      paymentStatus: z.enum(["pending", "paid", "partial", "cancelled"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [current] = await db.select().from(orders).where(eq(orders.id, input.id));
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });

      await db.update(orders).set({ paymentStatus: input.paymentStatus }).where(eq(orders.id, input.id));

      // Idem: garante que o pagamento apareça no Relatório Financeiro
      if (input.paymentStatus === "paid") {
        const [existing] = await db.select({ id: paymentRecords.id }).from(paymentRecords)
          .where(eq(paymentRecords.orderId, input.id)).limit(1);
        if (!existing) {
          await db.insert(paymentRecords).values({
            orderId: input.id,
            paymentMethod: current.paymentMethod as "cash" | "pix",
            amount: current.totalAmount,
            paidAt: new Date(),
            registeredBy: ctx.user.id,
            notes: "Registrado automaticamente ao marcar como pago",
          });
        }
      }

      return { success: true };
    }),

  pendingPayments: protectedProcedure
    .input(z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional() }).optional())
    .query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];

    const conditions = [
      or(eq(orders.paymentStatus, "pending"), eq(orders.paymentStatus, "partial")),
      eq(orders.status, "delivered"),
      sql`(${customers.isInternal} = false OR ${customers.isInternal} IS NULL)`,
    ];
    if (input?.dateFrom) conditions.push(gte(orders.createdAt, new Date(input.dateFrom + "T00:00:00")));
    if (input?.dateTo) conditions.push(lte(orders.createdAt, new Date(input.dateTo + "T23:59:59")));

    const rows = await db.select({
      id: orders.id, totalAmount: orders.totalAmount, paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus, status: orders.status,
      deliveryDate: orders.deliveryDate, createdAt: orders.createdAt,
      deliveredAt: deliveryRecords.deliveredAt,
      customerName: customers.name, customerPhone: customers.phone,
      customerStreet: customers.street, customerNumber: customers.number,
      customerNeighborhood: customers.neighborhood, customerCity: customers.city,
      deliveryAddress: orders.deliveryAddress,
    }).from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(deliveryRecords, eq(orders.id, deliveryRecords.orderId))
      // Pedidos entregues com pagamento pendente OU parcial (ainda falta receber algo),
      // exceto de clientes internos (ex: pedidos de estoque não geram cobrança real)
      .where(and(...conditions));

    // Monta a lista de produtos comprados em cada pedido (mesmo padrão usado em list)
    const orderIds = rows.map(o => o.id);
    const productListMap: Record<number, string[]> = {};

    if (orderIds.length > 0) {
      const allOrderItems = await db.select({
        id: orderItems.id, orderId: orderItems.orderId, productName: products.name,
        quantity: orderItems.quantity,
      }).from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));

      const allOrderItemIds = allOrderItems.map(i => i.id);
      const flavorMap: Record<number, string[]> = {};
      if (allOrderItemIds.length > 0) {
        const flavorRows = await db.select({
          orderItemId: orderItemFlavors.orderItemId, flavorName: orderItemFlavors.flavorName,
        }).from(orderItemFlavors).where(inArray(orderItemFlavors.orderItemId, allOrderItemIds));
        for (const f of flavorRows) {
          (flavorMap[f.orderItemId] ??= []).push(f.flavorName);
        }
      }

      for (const item of allOrderItems) {
        const flavors = flavorMap[item.id] ?? [];
        const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
        (productListMap[item.orderId] ??= []).push(`${item.productName}${flavorStr} (${item.quantity}x)`);
      }

      const mpRows = await db.select({
        id: orderMinipizzas.id, orderId: orderMinipizzas.orderId,
        typeName: minipizzaTypes.name, quantity: orderMinipizzas.quantity,
      }).from(orderMinipizzas)
        .leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
        .where(inArray(orderMinipizzas.orderId, orderIds));

      const mpIds = mpRows.map(m => m.id);
      const mpFlavorMap: Record<number, string[]> = {};
      if (mpIds.length > 0) {
        const flavorRows = await db.select({
          orderMinipizzaId: orderMinipizzaFlavors.orderMinipizzaId, flavorName: minipizzaFlavors.name,
        }).from(orderMinipizzaFlavors)
          .leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
          .where(inArray(orderMinipizzaFlavors.orderMinipizzaId, mpIds));
        for (const f of flavorRows) {
          (mpFlavorMap[f.orderMinipizzaId] ??= []).push(f.flavorName ?? "");
        }
      }

      for (const mp of mpRows) {
        const flavors = mpFlavorMap[mp.id] ?? [];
        const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
        (productListMap[mp.orderId] ??= []).push(`Minipizza ${mp.typeName ?? "—"}${flavorStr} (${mp.quantity}x)`);
      }

      const jRows = await db.select({
        orderId: orderJellies.orderId, flavorName: jellyFlavors.name, quantity: orderJellies.quantity,
      }).from(orderJellies)
        .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
        .where(inArray(orderJellies.orderId, orderIds));

      for (const j of jRows) {
        (productListMap[j.orderId] ??= []).push(`Geleia ${j.flavorName} (${j.quantity}x)`);
      }
    }

    return rows.map(o => ({ ...o, productList: productListMap[o.id] ?? [] }));
  }),

  bulkUpdateStatus: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
      status: z.enum(["received", "production", "in_route", "packaged", "delivered", "delivery_failed", "paid", "cancelled"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const updateData: Record<string, any> = { status: input.status };
      if (input.status === "paid") updateData.paymentStatus = "paid";
      if (input.status === "cancelled") {
        updateData.paymentStatus = "cancelled";
        updateData.cancelledBy = ctx.user.id;
        updateData.cancelledAt = new Date();
      }

      // Get current statuses for history
      const currentOrders = await db.select({ id: orders.id, status: orders.status }).from(orders).where(inArray(orders.id, input.ids));

      await db.update(orders).set(updateData).where(inArray(orders.id, input.ids));

      // Record history
      if (currentOrders.length > 0) {
        await db.insert(orderStatusHistory).values(
          currentOrders.map(o => ({
            orderId: o.id,
            userId: ctx.user.id,
            fromStatus: o.status,
            toStatus: input.status,
            notes: "Atualização em massa",
          }))
        );
      }

      // Ao cancelar, os pedidos deixam de fazer parte de qualquer rota de entrega
      if (input.status === "cancelled" && input.ids.length > 0) {
        await db.delete(routeOrders).where(inArray(routeOrders.orderId, input.ids));
      }

      // Idem às mutations individuais: garante que pagamento/entrega apareçam nos
      // relatórios mesmo quando o status foi alterado em massa por aqui.
      if (input.status === "paid" && input.ids.length > 0) {
        const ordersData = await db.select().from(orders).where(inArray(orders.id, input.ids));
        const alreadyPaid = await db.select({ orderId: paymentRecords.orderId }).from(paymentRecords)
          .where(inArray(paymentRecords.orderId, input.ids));
        const paidIds = new Set(alreadyPaid.map(r => r.orderId));
        const toInsertPayment = ordersData
          .filter(o => !paidIds.has(o.id))
          .map(o => ({
            orderId: o.id,
            paymentMethod: o.paymentMethod as "cash" | "pix",
            amount: o.totalAmount,
            paidAt: new Date(),
            registeredBy: ctx.user.id,
            notes: "Registrado automaticamente ao marcar como pago (ação em massa)",
          }));
        if (toInsertPayment.length > 0) await db.insert(paymentRecords).values(toInsertPayment);
      }

      if (input.status === "delivered" && input.ids.length > 0) {
        const alreadyDelivered = await db.select({ orderId: deliveryRecords.orderId }).from(deliveryRecords)
          .where(inArray(deliveryRecords.orderId, input.ids));
        const deliveredIds = new Set(alreadyDelivered.map(r => r.orderId));
        const idsNeedingRecord = input.ids.filter(id => !deliveredIds.has(id));

        if (idsNeedingRecord.length > 0) {
          const routeInfos = await db.select({
            orderId: routeOrders.orderId, deliveryUserId: deliveryRoutes.deliveryUserId,
          }).from(routeOrders)
            .leftJoin(deliveryRoutes, eq(routeOrders.routeId, deliveryRoutes.id))
            .where(inArray(routeOrders.orderId, idsNeedingRecord));
          const routeDelivererMap = new Map(routeInfos.map(r => [r.orderId, r.deliveryUserId]));

          await db.insert(deliveryRecords).values(
            idsNeedingRecord.map(id => ({
              orderId: id,
              deliveryUserId: routeDelivererMap.get(id) ?? ctx.user.id,
              deliveredAt: new Date(),
              notes: "Registrado automaticamente ao marcar como entregue (ação em massa)",
            }))
          );
        }
      }

      return { success: true };
    }),

  bulkUpdatePaymentStatus: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
      paymentStatus: z.enum(["pending", "paid", "partial", "cancelled"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(orders).set({ paymentStatus: input.paymentStatus }).where(inArray(orders.id, input.ids));

      // Idem: garante que os pagamentos apareçam no Relatório Financeiro
      if (input.paymentStatus === "paid" && input.ids.length > 0) {
        const ordersData = await db.select().from(orders).where(inArray(orders.id, input.ids));
        const alreadyRecorded = await db.select({ orderId: paymentRecords.orderId }).from(paymentRecords)
          .where(inArray(paymentRecords.orderId, input.ids));
        const recordedIds = new Set(alreadyRecorded.map(r => r.orderId));

        const toInsert = ordersData
          .filter(o => !recordedIds.has(o.id))
          .map(o => ({
            orderId: o.id,
            paymentMethod: o.paymentMethod as "cash" | "pix",
            amount: o.totalAmount,
            paidAt: new Date(),
            registeredBy: ctx.user.id,
            notes: "Registrado automaticamente ao marcar como pago (ação em massa)",
          }));
        if (toInsert.length > 0) {
          await db.insert(paymentRecords).values(toInsert);
        }
      }

      return { success: true };
    }),

  bulkDelete: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      // Delete from related tables first
      await db.delete(orderItemFlavors).where(inArray(orderItemFlavors.orderItemId,
        db.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.orderId, input.ids))
      ));
      await db.delete(orderItemVariationSelections).where(inArray(orderItemVariationSelections.orderItemId,
        db.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.orderId, input.ids))
      ));
      await db.delete(orderItems).where(inArray(orderItems.orderId, input.ids));
      await db.delete(orderMinipizzas).where(inArray(orderMinipizzas.orderId, input.ids));
      await db.delete(orderMinipizzaFlavors).where(inArray(orderMinipizzaFlavors.orderMinipizzaId,
        db.select({ id: orderMinipizzas.id }).from(orderMinipizzas).where(inArray(orderMinipizzas.orderId, input.ids))
      ));
      await db.delete(orderJellies).where(inArray(orderJellies.orderId, input.ids));
      await db.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, input.ids));
      await db.delete(deliveryRecords).where(inArray(deliveryRecords.orderId, input.ids));
      await db.delete(paymentRecords).where(inArray(paymentRecords.orderId, input.ids));
      await db.delete(routeOrders).where(inArray(routeOrders.orderId, input.ids));
      await db.delete(storeOrderPayments).where(inArray(storeOrderPayments.orderId, input.ids));
      
      // Finally delete the orders
      await db.delete(orders).where(inArray(orders.id, input.ids));
      return { success: true };
    }),
});
