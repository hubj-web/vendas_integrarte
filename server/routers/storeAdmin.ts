/**
 * Router administrativo da Loja Pública — controlado de dentro do CRM Integrarte
 * (protegido por login, adminProcedure). Cuida de: abrir/fechar a loja, escolher
 * quais produtos do Estoque aparecem nela, e listar os pedidos vindos de lá.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  customers, deliveryMethods, orders, orderItems, orderItemFlavors, products, productCategories,
  storeOrderPayments, storeProductVisibility, storeSettings, estoqueAtual,
  storeDeliveryMethodVisibility, storeEvents, storeEventCategories,
  storeRegularCategoryVisibility,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";
import { buscarLotesEstoque, descontarLotesEstoque } from "./seller";

export const storeAdminRouter = router({
  /** Configuração atual da loja (aberta/fechada) */
  getSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [settings] = await db.select().from(storeSettings).orderBy(desc(storeSettings.id)).limit(1);
    return settings ?? null;
  }),

  /** Abre ou fecha a loja pública */
  updateSettings: adminProcedure
    .input(z.object({ isOpen: z.boolean(), closedMessage: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select({ id: storeSettings.id }).from(storeSettings).orderBy(desc(storeSettings.id)).limit(1);
      if (existing) {
        await db.update(storeSettings)
          .set({ isOpen: input.isOpen, closedMessage: input.closedMessage, updatedBy: ctx.user.id })
          .where(eq(storeSettings.id, existing.id));
      } else {
        await db.insert(storeSettings).values({ isOpen: input.isOpen, closedMessage: input.closedMessage, updatedBy: ctx.user.id });
      }
      return { success: true };
    }),

  /**
   * Produtos do Estoque disponíveis pra curadoria — mostra todo produto com
   * quantidade em estoque > 0, junto com o estado atual de visibilidade na loja
   * (se ainda não configurado, aparece como "não visível" por padrão — opt-in).
   */
  listStockProducts: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const estoqueLinhas = await db.select({ productId: estoqueAtual.productId, quantidade: estoqueAtual.quantidade })
      .from(estoqueAtual).where(gte(estoqueAtual.quantidade, 1));
    const qtyByProduct: Record<number, number> = {};
    for (const l of estoqueLinhas) qtyByProduct[l.productId] = (qtyByProduct[l.productId] ?? 0) + l.quantidade;

    const productIds = Object.keys(qtyByProduct).map(Number);
    if (productIds.length === 0) return [];

    const prods = await db.select({
      id: products.id, name: products.name, price: products.price, unit: products.unit,
      categoryId: products.categoryId, categoryName: productCategories.name,
    }).from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(inArray(products.id, productIds));

    const visibilidade = await db.select().from(storeProductVisibility).where(inArray(storeProductVisibility.productId, productIds));
    const visMap = new Map(visibilidade.map(v => [v.productId, v]));

    return prods.map(p => ({
      ...p,
      stockQuantity: qtyByProduct[p.id] ?? 0,
      visible: visMap.get(p.id)?.visible ?? false,
      storePrice: visMap.get(p.id)?.storePrice ?? null,
    })).sort((a, b) => (a.categoryName ?? "").localeCompare(b.categoryName ?? "") || a.name.localeCompare(b.name));
  }),

  /** Marca um produto como visível/oculto na loja, e opcionalmente define um preço específico */
  setProductVisibility: adminProcedure
    .input(z.object({ productId: z.number(), visible: z.boolean(), storePrice: z.string().nullable().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select({ id: storeProductVisibility.id }).from(storeProductVisibility)
        .where(eq(storeProductVisibility.productId, input.productId)).limit(1);
      if (existing) {
        await db.update(storeProductVisibility)
          .set({ visible: input.visible, storePrice: input.storePrice ?? null })
          .where(eq(storeProductVisibility.id, existing.id));
      } else {
        await db.insert(storeProductVisibility).values({
          productId: input.productId, visible: input.visible, storePrice: input.storePrice ?? null,
        });
      }
      return { success: true };
    }),

  /**
   * Confirma manualmente que o PIX caiu na conta (usado pelo PIX estático, que
   * não tem gateway/webhook). Marca o pedido como pago e desconta o estoque
   * — mesma lógica usada pelo webhook do Mercado Pago pro cartão.
   */
  confirmPayment: adminProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [payment] = await db.select().from(storeOrderPayments).where(eq(storeOrderPayments.orderId, input.orderId)).limit(1);
      if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado para este pedido." });
      if (payment.status === "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este pagamento já foi confirmado." });
      }

      await db.update(storeOrderPayments).set({ status: "approved", approvedAt: new Date() }).where(eq(storeOrderPayments.orderId, input.orderId));
      await db.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, input.orderId));

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.orderId));
      for (const item of items) {
        const flavorRows = await db.select({ productFlavorId: orderItemFlavors.productFlavorId })
          .from(orderItemFlavors).where(eq(orderItemFlavors.orderItemId, item.id));
        const lotes = await buscarLotesEstoque(db, item.productId, flavorRows.map(f => f.productFlavorId));
        await descontarLotesEstoque(db, lotes, item.quantity);
      }

      return { success: true };
    }),

  /** Lista as formas de entrega cadastradas, com o estado atual de visibilidade na loja */
  listDeliveryMethods: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const methods = await db.select().from(deliveryMethods).where(eq(deliveryMethods.active, true));
    const visRows = await db.select().from(storeDeliveryMethodVisibility);
    const visMap = new Map(visRows.map(v => [v.deliveryMethodId, v.visible]));
    return methods.map(m => ({ ...m, visibleInStore: visMap.get(m.id) ?? true }));
  }),

  /** Liga/desliga uma forma de entrega especificamente na Loja Pública (não afeta o cadastro geral) */
  setDeliveryMethodVisibility: adminProcedure
    .input(z.object({ deliveryMethodId: z.number(), visible: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select({ id: storeDeliveryMethodVisibility.id }).from(storeDeliveryMethodVisibility)
        .where(eq(storeDeliveryMethodVisibility.deliveryMethodId, input.deliveryMethodId)).limit(1);
      if (existing) {
        await db.update(storeDeliveryMethodVisibility).set({ visible: input.visible }).where(eq(storeDeliveryMethodVisibility.id, existing.id));
      } else {
        await db.insert(storeDeliveryMethodVisibility).values({ deliveryMethodId: input.deliveryMethodId, visible: input.visible });
      }
      return { success: true };
    }),

  /** Lista todas as categorias, com o estado atual de visibilidade na Venda Regular */
  listRegularCategories: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const cats = await db.select().from(productCategories).where(eq(productCategories.active, true));
    const visRows = await db.select().from(storeRegularCategoryVisibility);
    const visMap = new Map(visRows.map(v => [v.categoryId, v.visible]));
    return cats.map(c => ({ ...c, visibleInRegular: visMap.get(c.id) ?? true }));
  }),

  /** Liga/desliga uma categoria especificamente na Venda Regular (não afeta eventos nem o cadastro geral) */
  setRegularCategoryVisibility: adminProcedure
    .input(z.object({ categoryId: z.number(), visible: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select({ id: storeRegularCategoryVisibility.id }).from(storeRegularCategoryVisibility)
        .where(eq(storeRegularCategoryVisibility.categoryId, input.categoryId)).limit(1);
      if (existing) {
        await db.update(storeRegularCategoryVisibility).set({ visible: input.visible }).where(eq(storeRegularCategoryVisibility.id, existing.id));
      } else {
        await db.insert(storeRegularCategoryVisibility).values({ categoryId: input.categoryId, visible: input.visible });
      }
      return { success: true };
    }),

  /** Lista os pedidos vindos da Loja Pública, com status de pagamento e entrega */
  orders: adminProcedure
    .input(z.object({ paymentStatus: z.enum(["pending", "paid", "partial", "cancelled"]).optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(orders.channel, "loja_publica")];
      if (input?.paymentStatus) conditions.push(eq(orders.paymentStatus, input.paymentStatus));

      const rows = await db.select({
        id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus,
        totalAmount: orders.totalAmount, paymentMethod: orders.paymentMethod,
        createdAt: orders.createdAt, deliveryMethodId: orders.deliveryMethodId,
        deliveryMethodName: deliveryMethods.name,
        customerName: customers.name, customerPhone: customers.phone,
      }).from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

      if (rows.length === 0) return [];
      const payments = await db.select().from(storeOrderPayments).where(inArray(storeOrderPayments.orderId, rows.map(r => r.id)));
      const paymentByOrder = new Map(payments.map(p => [p.orderId, p]));

      return rows.map(r => ({ ...r, payment: paymentByOrder.get(r.id) ?? null }));
    }),

  // ── EVENTOS DA LOJA ──────────────────────────────────────────────────────
  events: router({
    /** Lista todos os eventos (abertos ou não), com as categorias já vinculadas */
    list: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const events = await db.select().from(storeEvents).orderBy(storeEvents.sortOrder);
      if (events.length === 0) return [];
      const links = await db.select().from(storeEventCategories).where(inArray(storeEventCategories.eventId, events.map(e => e.id)));
      const catIds = Array.from(new Set(links.map(l => l.categoryId)));
      const cats = catIds.length > 0 ? await db.select().from(productCategories).where(inArray(productCategories.id, catIds)) : [];
      const catById = new Map(cats.map(c => [c.id, c]));
      return events.map(e => ({
        ...e,
        categories: links.filter(l => l.eventId === e.id).map(l => catById.get(l.categoryId)).filter(Boolean),
      }));
    }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(2), type: z.enum(["ingresso", "produtos"]),
        description: z.string().optional(), eventDate: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const result = await db.insert(storeEvents).values({
          name: input.name, type: input.type, description: input.description,
          eventDate: input.eventDate ? new Date(input.eventDate) : undefined,
          createdBy: ctx.user.id,
        });
        const id = Number((result as any).insertId ?? (result as any)[0]?.insertId);
        return { success: true, id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(), name: z.string().min(2).optional(), type: z.enum(["ingresso", "produtos"]).optional(),
        description: z.string().nullable().optional(), eventDate: z.string().nullable().optional(),
        isOpen: z.boolean().optional(), sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, eventDate, ...rest } = input;
        await db.update(storeEvents).set({
          ...rest,
          ...(eventDate !== undefined ? { eventDate: eventDate ? new Date(eventDate) : null } : {}),
        }).where(eq(storeEvents.id, id));
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const linked = await db.select({ id: orders.id }).from(orders).where(eq(orders.eventId, input.id)).limit(1);
        if (linked.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Este evento já tem pedidos — feche-o em vez de excluir, pra manter o histórico." });
        await db.delete(storeEventCategories).where(eq(storeEventCategories.eventId, input.id));
        await db.delete(storeEvents).where(eq(storeEvents.id, input.id));
        return { success: true };
      }),

    /** Substitui a lista de categorias vinculadas a um evento (marca só as selecionadas) */
    setCategories: adminProcedure
      .input(z.object({ eventId: z.number(), categoryIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(storeEventCategories).where(eq(storeEventCategories.eventId, input.eventId));
        if (input.categoryIds.length > 0) {
          await db.insert(storeEventCategories).values(input.categoryIds.map((categoryId, i) => ({ eventId: input.eventId, categoryId, sortOrder: i })));
        }
        return { success: true };
      }),

    /** Sobe o banner do evento (mostrado na tela de escolha da Loja Pública) — salvo direto no banco. */
    uploadImage: adminProcedure
      .input(z.object({ id: z.number(), imageBase64: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(storeEvents).set({ imageUrl: input.imageBase64 }).where(eq(storeEvents.id, input.id));
        return { success: true, url: input.imageBase64 };
      }),
  }),
});
