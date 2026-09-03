/**
 * Router administrativo da Loja Pública — controlado de dentro do CRM Integrarte
 * (protegido por login, adminProcedure). Cuida de: abrir/fechar a loja, escolher
 * quais produtos do Estoque aparecem nela, e listar os pedidos vindos de lá.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  customers, deliveryMethods, orders, orderItems, orderItemFlavors, products, productCategories,
  storeOrderPayments, storeProductVisibility, storeSettings, estoqueAtual,
  storeDeliveryMethodVisibility, storeEvents, storeEventCategories,
  storeRegularCategoryVisibility, orderItemVariationSelections, activityLog,
  paymentMethods, storeRegularPaymentMethodVisibility, storeEventPaymentMethodVisibility,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";
import { logActivity } from "../activityLog";
import { buscarLotesEstoque, descontarLotesEstoque } from "./seller";

export const storeAdminRouter = router({
  /** Configuração atual da loja (aberta/fechada) */
  getSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [settings] = await db.select().from(storeSettings).orderBy(desc(storeSettings.id)).limit(1);
    return settings ?? null;
  }),

  /** Abre ou fecha a loja pública, e/ou ajusta a aparência (título, mensagem, cor) */
  updateSettings: adminProcedure
    .input(z.object({
      isOpen: z.boolean().optional(), closedMessage: z.string().optional(),
      saleStartsAt: z.string().nullable().optional(), saleEndsAt: z.string().nullable().optional(),
      storeTitle: z.string().nullable().optional(), welcomeMessage: z.string().nullable().optional(),
      primaryColor: z.string().nullable().optional(),
      titleFontFamily: z.string().nullable().optional(), titleFontSize: z.number().nullable().optional(), titleColor: z.string().nullable().optional(),
      messageFontFamily: z.string().nullable().optional(), messageFontSize: z.number().nullable().optional(), messageColor: z.string().nullable().optional(),
      whatsappNumber: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select().from(storeSettings).orderBy(desc(storeSettings.id)).limit(1);
      const values = {
        isOpen: input.isOpen ?? existing?.isOpen ?? false,
        closedMessage: input.closedMessage ?? existing?.closedMessage,
        updatedBy: ctx.user.id,
        ...(input.saleStartsAt !== undefined ? { saleStartsAt: input.saleStartsAt ? new Date(input.saleStartsAt) : null } : {}),
        ...(input.saleEndsAt !== undefined ? { saleEndsAt: input.saleEndsAt ? new Date(input.saleEndsAt) : null } : {}),
        ...(input.storeTitle !== undefined ? { storeTitle: input.storeTitle } : {}),
        ...(input.welcomeMessage !== undefined ? { welcomeMessage: input.welcomeMessage } : {}),
        ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
        ...(input.titleFontFamily !== undefined ? { titleFontFamily: input.titleFontFamily } : {}),
        ...(input.titleFontSize !== undefined ? { titleFontSize: input.titleFontSize } : {}),
        ...(input.titleColor !== undefined ? { titleColor: input.titleColor } : {}),
        ...(input.messageFontFamily !== undefined ? { messageFontFamily: input.messageFontFamily } : {}),
        ...(input.messageFontSize !== undefined ? { messageFontSize: input.messageFontSize } : {}),
        ...(input.messageColor !== undefined ? { messageColor: input.messageColor } : {}),
        ...(input.whatsappNumber !== undefined ? { whatsappNumber: input.whatsappNumber } : {}),
      };
      if (existing) {
        await db.update(storeSettings).set(values).where(eq(storeSettings.id, existing.id));
      } else {
        await db.insert(storeSettings).values(values);
      }
      await logActivity({
        userId: ctx.user.id, userName: ctx.user.name, action: "store.updateSettings",
        entityType: "store_settings",
        description: input.isOpen !== undefined
          ? `${ctx.user.name} ${input.isOpen ? "abriu" : "fechou"} a Venda Regular da loja`
          : `${ctx.user.name} atualizou a aparência da loja`,
      });
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

    // Produto "sob encomenda" pode ter ZERO estoque de propósito (é o objetivo
    // da pré-venda) — precisa aparecer aqui mesmo assim, senão não tem como
    // ativar ele na loja nunca.
    const preOrderRows = await db.select({ id: products.id }).from(products).where(eq(products.allowPreOrder, true));

    const productIds = Array.from(new Set([...Object.keys(qtyByProduct).map(Number), ...preOrderRows.map(p => p.id)]));
    if (productIds.length === 0) return [];

    const prods = await db.select({
      id: products.id, name: products.name, price: products.price, unit: products.unit,
      categoryId: products.categoryId, categoryName: productCategories.name, allowPreOrder: products.allowPreOrder,
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
    .mutation(async ({ input, ctx }) => {
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
      const [prod] = await db.select({ name: products.name }).from(products).where(eq(products.id, input.productId)).limit(1);
      await logActivity({
        userId: ctx.user.id, userName: ctx.user.name, action: "store.setProductVisibility",
        entityType: "product", entityId: input.productId,
        description: `${ctx.user.name} ${input.visible ? "ativou" : "desativou"} "${prod?.name ?? input.productId}" na loja${input.storePrice ? ` (preço: R$ ${input.storePrice})` : ""}`,
      });
      return { success: true };
    }),

  /**
   * Confirma manualmente que o PIX caiu na conta (usado pelo PIX estático, que
   * não tem gateway/webhook). Marca o pedido como pago e desconta o estoque
   * — mesma lógica usada pelo webhook do Mercado Pago pro cartão.
   */
  confirmPayment: adminProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ input, ctx }) => {
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

      await logActivity({
        userId: ctx.user.id, userName: ctx.user.name, action: "store.confirmPayment",
        entityType: "order", entityId: input.orderId,
        description: `${ctx.user.name} confirmou o pagamento do pedido #${input.orderId}`,
      });

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
    const eventLinks = await db.select({ categoryId: storeEventCategories.categoryId }).from(storeEventCategories);
    const linkedToEvent = new Set(eventLinks.map(l => l.categoryId));
    return cats.map(c => ({
      ...c,
      linkedToEvent: linkedToEvent.has(c.id),
      // Default: categoria de evento fica OCULTA na Venda Regular até liberar; categoria "normal" fica visível.
      visibleInRegular: visMap.get(c.id) ?? !linkedToEvent.has(c.id),
    }));
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
  /** Lista os pedidos vindos da Loja Pública e das vendas de evento do vendedor */
  orders: adminProcedure
    .input(z.object({
      paymentStatus: z.enum(["pending", "paid", "partial", "cancelled"]).optional(),
      eventId: z.union([z.number(), z.literal("regular")]).optional(), // "regular" = sem evento (Venda Regular)
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [inArray(orders.channel, ["loja_publica", "vendedor_evento"])];
      if (input?.paymentStatus) conditions.push(eq(orders.paymentStatus, input.paymentStatus));
      if (input?.eventId === "regular") conditions.push(isNull(orders.eventId));
      else if (typeof input?.eventId === "number") conditions.push(eq(orders.eventId, input.eventId));

      const rows = await db.select({
        id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus,
        totalAmount: orders.totalAmount, paymentMethod: orders.paymentMethod, channel: orders.channel,
        createdAt: orders.createdAt, deliveryMethodId: orders.deliveryMethodId,
        deliveryMethodName: deliveryMethods.name, eventId: orders.eventId, eventName: storeEvents.name,
        customerName: customers.name, customerPhone: customers.phone,
      }).from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .leftJoin(storeEvents, eq(orders.eventId, storeEvents.id))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

      if (rows.length === 0) return [];
      const payments = await db.select().from(storeOrderPayments).where(inArray(storeOrderPayments.orderId, rows.map(r => r.id)));
      const paymentByOrder = new Map(payments.map(p => [p.orderId, p]));

      return rows.map(r => ({ ...r, payment: paymentByOrder.get(r.id) ?? null }));
    }),

  /** Detalhe completo de um pedido — itens, endereço, variações escolhidas */
  orderDetail: adminProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [order] = await db.select({
        id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus,
        totalAmount: orders.totalAmount, paymentMethod: orders.paymentMethod, channel: orders.channel,
        createdAt: orders.createdAt, deliveryAddress: orders.deliveryAddress, notes: orders.notes,
        deliveryMethodName: deliveryMethods.name, deliveryMethodId: orders.deliveryMethodId,
        eventName: storeEvents.name, ticketCode: orders.ticketCode,
        customerName: customers.name, customerPhone: customers.phone, customerId: orders.customerId,
      }).from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .leftJoin(storeEvents, eq(orders.eventId, storeEvents.id))
        .where(eq(orders.id, input.orderId))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      const items = await db.select({
        id: orderItems.id, productName: products.name, quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice, subtotal: orderItems.subtotal,
      }).from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(eq(orderItems.orderId, input.orderId));

      const itemIds = items.map(i => i.id);
      const flavorRows = itemIds.length > 0 ? await db.select().from(orderItemFlavors).where(inArray(orderItemFlavors.orderItemId, itemIds)) : [];
      const selectionRows = itemIds.length > 0 ? await db.select().from(orderItemVariationSelections).where(inArray(orderItemVariationSelections.orderItemId, itemIds)) : [];

      const itemsWithExtras = items.map(item => ({
        ...item,
        flavors: flavorRows.filter(f => f.orderItemId === item.id).map(f => f.flavorName),
        selections: selectionRows.filter(s => s.orderItemId === item.id).map(s => s.optionName),
      }));

      const [payment] = await db.select().from(storeOrderPayments).where(eq(storeOrderPayments.orderId, input.orderId)).limit(1);

      return { ...order, items: itemsWithExtras, payment: payment ?? null };
    }),

  /** Edita os dados de um pedido da loja (cliente, entrega, status, observações) */
  updateOrder: adminProcedure
    .input(z.object({
      orderId: z.number(),
      customerName: z.string().optional(), customerPhone: z.string().optional(),
      deliveryAddress: z.string().nullable().optional(), deliveryMethodId: z.number().optional(),
      status: z.enum(["production", "in_route", "packaged", "delivered", "paid", "cancelled"]).optional(),
      paymentStatus: z.enum(["pending", "paid", "cancelled"]).optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [order] = await db.select({ customerId: orders.customerId }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      if (order.customerId && (input.customerName !== undefined || input.customerPhone !== undefined)) {
        await db.update(customers).set({
          ...(input.customerName !== undefined ? { name: input.customerName } : {}),
          ...(input.customerPhone !== undefined ? { phone: input.customerPhone } : {}),
        }).where(eq(customers.id, order.customerId));
      }

      const orderUpdates: Record<string, any> = {};
      if (input.deliveryAddress !== undefined) orderUpdates.deliveryAddress = input.deliveryAddress;
      if (input.deliveryMethodId !== undefined) orderUpdates.deliveryMethodId = input.deliveryMethodId;
      if (input.status !== undefined) orderUpdates.status = input.status;
      if (input.paymentStatus !== undefined) orderUpdates.paymentStatus = input.paymentStatus;
      if (input.notes !== undefined) orderUpdates.notes = input.notes;
      if (Object.keys(orderUpdates).length > 0) {
        await db.update(orders).set(orderUpdates).where(eq(orders.id, input.orderId));
      }

      await logActivity({
        userId: ctx.user.id, userName: ctx.user.name, action: "store.updateOrder",
        entityType: "order", entityId: input.orderId,
        description: `${ctx.user.name} editou o pedido #${input.orderId} da loja`,
      });

      return { success: true };
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
        const checkInCode = String(Math.floor(100000 + Math.random() * 900000));
        const result = await db.insert(storeEvents).values({
          name: input.name, type: input.type, description: input.description,
          eventDate: input.eventDate ? new Date(input.eventDate) : undefined,
          createdBy: ctx.user.id, checkInCode,
        });
        const id = Number((result as any).insertId ?? (result as any)[0]?.insertId);
        return { success: true, id };
      }),

    /** Gera (ou troca) o código de check-in de um evento — pra invalidar o antigo se vazar */
    regenerateCheckInCode: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const checkInCode = String(Math.floor(100000 + Math.random() * 900000));
        await db.update(storeEvents).set({ checkInCode }).where(eq(storeEvents.id, input.id));
        return { success: true, checkInCode };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(), name: z.string().min(2).optional(), type: z.enum(["ingresso", "produtos"]).optional(),
        description: z.string().nullable().optional(), eventDate: z.string().nullable().optional(),
        isOpen: z.boolean().optional(), sortOrder: z.number().optional(),
        saleStartsAt: z.string().nullable().optional(), saleEndsAt: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, eventDate, saleStartsAt, saleEndsAt, ...rest } = input;
        await db.update(storeEvents).set({
          ...rest,
          ...(eventDate !== undefined ? { eventDate: eventDate ? new Date(eventDate) : null } : {}),
          ...(saleStartsAt !== undefined ? { saleStartsAt: saleStartsAt ? new Date(saleStartsAt) : null } : {}),
          ...(saleEndsAt !== undefined ? { saleEndsAt: saleEndsAt ? new Date(saleEndsAt) : null } : {}),
        }).where(eq(storeEvents.id, id));
        if (input.isOpen !== undefined) {
          const [ev] = await db.select({ name: storeEvents.name }).from(storeEvents).where(eq(storeEvents.id, id)).limit(1);
          await logActivity({
            userId: ctx.user.id, userName: ctx.user.name, action: "store.events.update",
            entityType: "event", entityId: id,
            description: `${ctx.user.name} ${input.isOpen ? "abriu" : "fechou"} o evento "${ev?.name ?? id}"`,
          });
        }
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

  /** Log de auditoria — quem mudou o quê na loja pública, mais recente primeiro */
  activityLog: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(100) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(activityLog).orderBy(desc(activityLog.id)).limit(input?.limit ?? 100);
    }),

  /**
   * Resumo de "onde este produto está à venda" — usado no cadastro de
   * Produtos pra deixar claro, sem sair da tela, se ele aparece na Venda
   * Regular e/ou em quais Eventos (via categoria vinculada).
   */
  productSalesSummary: adminProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { inRegular: false, events: [], visibleInStore: false, storePrice: null };

      const [prod] = await db.select({ categoryId: products.categoryId }).from(products).where(eq(products.id, input.productId)).limit(1);
      if (!prod) return { inRegular: false, events: [], visibleInStore: false, storePrice: null };

      const [vis] = await db.select().from(storeProductVisibility).where(eq(storeProductVisibility.productId, input.productId)).limit(1);
      const visibleInStore = vis?.visible ?? false;

      if (!prod.categoryId || !visibleInStore) return { inRegular: false, events: [], visibleInStore, storePrice: vis?.storePrice ?? null };

      const eventLinks = await db.select({ eventId: storeEventCategories.eventId }).from(storeEventCategories).where(eq(storeEventCategories.categoryId, prod.categoryId));
      const eventIds = eventLinks.map(l => l.eventId);
      const events = eventIds.length > 0 ? await db.select({ id: storeEvents.id, name: storeEvents.name }).from(storeEvents).where(inArray(storeEvents.id, eventIds)) : [];

      const [regularVis] = await db.select().from(storeRegularCategoryVisibility).where(eq(storeRegularCategoryVisibility.categoryId, prod.categoryId)).limit(1);
      const linkedToEvent = eventIds.length > 0;
      const inRegular = regularVis?.visible ?? !linkedToEvent;

      return { inRegular, events, visibleInStore, storePrice: vis?.storePrice ?? null };
    }),

  // ── FORMAS DE PAGAMENTO ─────────────────────────────────────────────────
  paymentMethods: router({
    /** Lista as 4 formas de pagamento, com estado global + visibilidade na Venda Regular */
    list: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const methods = await db.select().from(paymentMethods);
      const regularVis = await db.select().from(storeRegularPaymentMethodVisibility);
      const regularVisMap = new Map(regularVis.map(v => [v.paymentMethodId, v.visible]));
      return methods.map(m => ({ ...m, visibleInRegular: regularVisMap.get(m.id) ?? true }));
    }),

    /** Liga/desliga uma forma de pagamento em todo o sistema (some de todo lugar) */
    setActive: adminProcedure
      .input(z.object({ id: z.number(), active: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(paymentMethods).set({ active: input.active }).where(eq(paymentMethods.id, input.id));
        const [m] = await db.select({ name: paymentMethods.name }).from(paymentMethods).where(eq(paymentMethods.id, input.id)).limit(1);
        await logActivity({
          userId: ctx.user.id, userName: ctx.user.name, action: "store.paymentMethods.setActive",
          entityType: "payment_method", entityId: input.id,
          description: `${ctx.user.name} ${input.active ? "ativou" : "desativou"} a forma de pagamento "${m?.name ?? input.id}" em todo o sistema`,
        });
        return { success: true };
      }),

    /** Liga/desliga uma forma de pagamento especificamente na Venda Regular */
    setRegularVisibility: adminProcedure
      .input(z.object({ paymentMethodId: z.number(), visible: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [existing] = await db.select({ id: storeRegularPaymentMethodVisibility.id }).from(storeRegularPaymentMethodVisibility)
          .where(eq(storeRegularPaymentMethodVisibility.paymentMethodId, input.paymentMethodId)).limit(1);
        if (existing) {
          await db.update(storeRegularPaymentMethodVisibility).set({ visible: input.visible }).where(eq(storeRegularPaymentMethodVisibility.id, existing.id));
        } else {
          await db.insert(storeRegularPaymentMethodVisibility).values({ paymentMethodId: input.paymentMethodId, visible: input.visible });
        }
        return { success: true };
      }),

    /** Lista as formas de pagamento de loja (PIX/Cartão) com o estado de visibilidade num evento específico */
    listForEvent: adminProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const methods = await db.select().from(paymentMethods).where(inArray(paymentMethods.code, ["pix_loja", "cartao_loja"]));
        const vis = await db.select().from(storeEventPaymentMethodVisibility).where(eq(storeEventPaymentMethodVisibility.eventId, input.eventId));
        const visMap = new Map(vis.map(v => [v.paymentMethodId, v.visible]));
        return methods.map(m => ({ ...m, visibleInEvent: visMap.get(m.id) ?? true }));
      }),

    /** Liga/desliga uma forma de pagamento especificamente num evento */
    setEventVisibility: adminProcedure
      .input(z.object({ eventId: z.number(), paymentMethodId: z.number(), visible: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [existing] = await db.select({ id: storeEventPaymentMethodVisibility.id }).from(storeEventPaymentMethodVisibility)
          .where(and(eq(storeEventPaymentMethodVisibility.eventId, input.eventId), eq(storeEventPaymentMethodVisibility.paymentMethodId, input.paymentMethodId))).limit(1);
        if (existing) {
          await db.update(storeEventPaymentMethodVisibility).set({ visible: input.visible }).where(eq(storeEventPaymentMethodVisibility.id, existing.id));
        } else {
          await db.insert(storeEventPaymentMethodVisibility).values({ eventId: input.eventId, paymentMethodId: input.paymentMethodId, visible: input.visible });
        }
        return { success: true };
      }),
  }),
});
