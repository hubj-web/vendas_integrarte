/**
 * Vendas de Evento pelo Vendedor — permite ao vendedor lançar, dentro do app
 * de vendas (com login), a venda de ingresso ou produto de um Evento da Loja
 * (o mesmo cadastro de eventos usado na Loja Pública). Gera o mesmo recibo
 * com QR code que o cliente receberia comprando sozinho, pra o vendedor poder
 * enviar por WhatsApp.
 *
 * Diferença do fluxo da Loja Pública: aqui o pagamento é combinado
 * diretamente entre vendedor e cliente (dinheiro/pix na mão), então o pedido
 * já nasce com o status de pagamento que o vendedor informar — sem gateway.
 */
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  customers, orderItems, orderItemFlavors, orders, orderStatusHistory,
  productCategories, productFlavors, products, storeEvents, storeEventCategories,
  storeProductVisibility, estoqueAtual, estoqueAtualFlavors, deliveryMethods,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { buscarLotesEstoque, descontarLotesEstoque, requireLauncherRole } from "./seller";
import { isEffectivelyOpen } from "./publicStore";

export const sellerEventsRouter = router({
  /** Eventos abertos disponíveis pro vendedor lançar venda */
  listOpenEvents: protectedProcedure.query(async ({ ctx }) => {
    requireLauncherRole(ctx);
    const db = await getDb();
    if (!db) return [];
    const events = await db.select().from(storeEvents).orderBy(storeEvents.sortOrder);
    return events.filter(isEffectivelyOpen);
  }),

  /** Catálogo (categorias + produtos com estoque) de um evento específico, pro vendedor escolher */
  eventCatalog: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input, ctx }) => {
      requireLauncherRole(ctx);
      const db = await getDb();
      if (!db) return { categories: [], products: [] };

      const links = await db.select({ categoryId: storeEventCategories.categoryId }).from(storeEventCategories).where(eq(storeEventCategories.eventId, input.eventId));
      const categoryIds = links.map(l => l.categoryId);
      if (categoryIds.length === 0) return { categories: [], products: [] };

      const estoqueLinhas = await db.select({ id: estoqueAtual.id, productId: estoqueAtual.productId, quantidade: estoqueAtual.quantidade })
        .from(estoqueAtual);
      const estoqueIds = estoqueLinhas.map(l => l.id);
      const flavorRows = estoqueIds.length > 0
        ? await db.select({ estoqueAtualId: estoqueAtualFlavors.estoqueAtualId, productFlavorId: estoqueAtualFlavors.productFlavorId, flavorName: estoqueAtualFlavors.flavorName })
          .from(estoqueAtualFlavors).where(inArray(estoqueAtualFlavors.estoqueAtualId, estoqueIds))
        : [];
      const flavorsByLinha: Record<number, { id: number; name: string }[]> = {};
      for (const f of flavorRows) (flavorsByLinha[f.estoqueAtualId] ??= []).push({ id: f.productFlavorId, name: f.flavorName });

      const qtyByProduct: Record<number, number> = {};
      const flavorsByProduct: Record<number, Map<number, string>> = {};
      for (const l of estoqueLinhas) {
        qtyByProduct[l.productId] = (qtyByProduct[l.productId] ?? 0) + l.quantidade;
        for (const f of flavorsByLinha[l.id] ?? []) (flavorsByProduct[l.productId] ??= new Map()).set(f.id, f.name);
      }

      const prods = await db.select().from(products).where(inArray(products.categoryId, categoryIds));
      const cats = await db.select().from(productCategories).where(inArray(productCategories.id, categoryIds));

      return {
        categories: cats,
        products: prods.filter(p => p.active).map(p => ({
          ...p, availableQuantity: qtyByProduct[p.id] ?? 0,
          flavors: Array.from((flavorsByProduct[p.id] ?? new Map()).entries()).map(([id, name]) => ({ id, name })),
        })).filter(p => p.availableQuantity > 0),
      };
    }),

  /** Cria a venda de ingresso/produto de evento — pagamento combinado direto com o cliente */
  createTicketOrder: protectedProcedure
    .input(z.object({
      eventId: z.number(),
      customerName: z.string().min(1),
      customerPhone: z.string().min(8),
      items: z.array(z.object({
        productId: z.number(), quantity: z.number().min(1), flavorIds: z.array(z.number()).optional(),
      })).min(1),
      paymentMethod: z.enum(["cash", "pix", "credit_card", "debit_card"]),
      paymentStatus: z.enum(["pending", "paid"]).default("paid"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { user } = requireLauncherRole(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [event] = await db.select().from(storeEvents).where(eq(storeEvents.id, input.eventId)).limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });
      if (!isEffectivelyOpen(event)) throw new TRPCError({ code: "BAD_REQUEST", message: "Este evento não está aberto pra venda no momento." });

      const produtosRows = await db.select().from(products).where(inArray(products.id, input.items.map(i => i.productId)));
      const produtosMap = new Map(produtosRows.map(p => [p.id, p]));
      const visRows = await db.select().from(storeProductVisibility).where(inArray(storeProductVisibility.productId, input.items.map(i => i.productId)));
      const visMap = new Map(visRows.map(v => [v.productId, v]));

      let totalAmount = 0;
      const itemsResolved: { productId: number; quantity: number; flavorIds: number[]; unitPrice: number; subtotal: number; nome: string }[] = [];

      for (const item of input.items) {
        const prod = produtosMap.get(item.productId);
        if (!prod) throw new TRPCError({ code: "BAD_REQUEST", message: "Produto inválido." });
        const lotes = await buscarLotesEstoque(db, item.productId, item.flavorIds ?? []);
        const disponivel = lotes.reduce((acc, l) => acc + l.quantity, 0);
        if (disponivel < item.quantity) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Só há ${disponivel} de "${prod.name}" disponível.` });
        }
        const unitPrice = Number(visMap.get(item.productId)?.storePrice ?? prod.price);
        const subtotal = unitPrice * item.quantity;
        totalAmount += subtotal;
        itemsResolved.push({ productId: item.productId, quantity: item.quantity, flavorIds: item.flavorIds ?? [], unitPrice, subtotal, nome: prod.name });
      }

      const [existingCustomer] = await db.select().from(customers).where(eq(customers.phone, input.customerPhone)).limit(1);
      let customerId: number;
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const result = await db.insert(customers).values({ name: input.customerName, phone: input.customerPhone });
        customerId = Number((result as any)[0]?.insertId ?? (result as any).insertId);
      }

      // Ingresso/produto de evento não tem "entrega" no sentido tradicional —
      // usa a primeira forma de entrega cadastrada como "retirada" (ou a
      // primeira ativa, se não houver nenhuma marcada assim) só pra satisfazer
      // o campo obrigatório do pedido; não afeta rotas de entrega.
      const [pickupMethod] = await db.select().from(deliveryMethods)
        .where(eq(deliveryMethods.requiresAddress, false)).limit(1);
      const [anyMethod] = pickupMethod ? [] : await db.select().from(deliveryMethods).limit(1);
      const deliveryMethodId = pickupMethod?.id ?? anyMethod?.id;
      if (!deliveryMethodId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Nenhuma forma de entrega cadastrada." });

      const ticketCode = nanoid(12);

      const orderResult = await db.insert(orders).values({
        customerId,
        launcherId: user.id,
        deliveryMethodId,
        paymentMethod: input.paymentMethod,
        channel: "vendedor_evento",
        eventId: input.eventId,
        ticketCode,
        status: "production",
        paymentStatus: input.paymentStatus,
        totalAmount: totalAmount.toFixed(2),
        notes: input.notes ?? `Venda de evento (${event.name}) lançada por ${user.name}`,
      });
      const orderId = Number((orderResult as any)[0]?.insertId ?? (orderResult as any).insertId);

      for (const item of itemsResolved) {
        const itemResult = await db.insert(orderItems).values({
          orderId, productId: item.productId, quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2), subtotal: item.subtotal.toFixed(2),
        });
        const orderItemId = Number((itemResult as any)[0]?.insertId ?? (itemResult as any).insertId);
        if (item.flavorIds.length > 0) {
          const flavorRows = await db.select().from(productFlavors).where(inArray(productFlavors.id, item.flavorIds));
          if (flavorRows.length > 0) {
            await db.insert(orderItemFlavors).values(flavorRows.map(f => ({ orderItemId, productFlavorId: f.id, flavorName: f.name })));
          }
        }
        const lotes = await buscarLotesEstoque(db, item.productId, item.flavorIds);
        await descontarLotesEstoque(db, lotes, item.quantity);
      }

      await db.insert(orderStatusHistory).values({
        orderId, userId: user.id, fromStatus: null, toStatus: "production",
        notes: `Venda de evento lançada por ${user.name}`,
      });

      return { success: true, orderId, ticketCode };
    }),
});
