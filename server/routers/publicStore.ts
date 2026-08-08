/**
 * Router da Loja Pública — vitrine on-line sem necessidade de usuário/senha.
 * Regras que este router PRECISA garantir sempre:
 *  1. Só vende o que está no Estoque Integrarte (estoqueAtual) — nunca "fia" venda
 *     como o vendedor pode fazer durante o período de vendas.
 *  2. Só mostra produtos que o admin marcou como visíveis na loja
 *     (store_product_visibility.visible = true).
 *  3. Não depende de login — identifica o cliente por nome + telefone.
 * Todos os pedidos criados aqui usam channel = 'loja_publica' e o usuário de
 * sistema "Loja Pública" como launcherId (nunca um ID vindo do cliente).
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  customers, deliveryMethods, orderItems, orderItemFlavors, orders, orderStatusHistory,
  productCategories, productFlavors, products, storeOrderPayments,
  storeProductVisibility, storeSettings, users, estoqueAtual, estoqueAtualFlavors,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { buscarLotesEstoque, descontarLotesEstoque } from "./seller";
import { createMercadoPagoPayment, mercadoPagoConfigured } from "../mercadopago";
import { buildPixPayload, generatePixQrCodeBase64, pixConfigured } from "../pix";
import { ENV } from "../_core/env";

const SYSTEM_USER_EMAIL = "loja-publica@sistema.integrarte.local";

async function getSystemUserId(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, SYSTEM_USER_EMAIL)).limit(1);
  if (!u) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Usuário de sistema da Loja Pública não encontrado — rode a migração 0013_loja_publica.sql.",
    });
  }
  return u.id;
}

export const publicStoreRouter = router({
  /** Chave PÚBLICA do Mercado Pago (nunca o access token) — usada pelo Payment Brick no navegador. */
  mpPublicKey: publicProcedure.query(() => ({
    publicKey: ENV.mercadoPagoPublicKey,
    configured: mercadoPagoConfigured() && !!ENV.mercadoPagoPublicKey,
  })),

  /** Catálogo público: só estoque disponível + marcado visível na loja. Loja fechada → lista vazia. */
  catalog: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { open: false, closedMessage: null, categories: [], products: [] };

    const [settings] = await db.select().from(storeSettings).orderBy(desc(storeSettings.id)).limit(1);
    if (!settings?.isOpen) {
      return { open: false, closedMessage: settings?.closedMessage ?? null, categories: [], products: [] };
    }

    // Estoque atual agrupado por produto (soma de todos os lotes/sabores)
    const estoqueLinhas = await db.select({
      id: estoqueAtual.id, productId: estoqueAtual.productId, quantidade: estoqueAtual.quantidade,
    }).from(estoqueAtual).where(gte(estoqueAtual.quantidade, 1));

    if (estoqueLinhas.length === 0) return { open: true, closedMessage: null, categories: [], products: [] };

    const estoqueIds = estoqueLinhas.map(l => l.id);
    const flavorRows = await db.select({
      estoqueAtualId: estoqueAtualFlavors.estoqueAtualId, productFlavorId: estoqueAtualFlavors.productFlavorId, flavorName: estoqueAtualFlavors.flavorName,
    }).from(estoqueAtualFlavors).where(inArray(estoqueAtualFlavors.estoqueAtualId, estoqueIds));
    const flavorsByLinha: Record<number, { id: number; name: string }[]> = {};
    for (const f of flavorRows) (flavorsByLinha[f.estoqueAtualId] ??= []).push({ id: f.productFlavorId, name: f.flavorName });

    const productIdsComEstoque = Array.from(new Set(estoqueLinhas.map(l => l.productId)));

    const visibilidade = await db.select().from(storeProductVisibility)
      .where(and(inArray(storeProductVisibility.productId, productIdsComEstoque), eq(storeProductVisibility.visible, true)));
    const visibilidadeMap = new Map(visibilidade.map(v => [v.productId, v]));
    const productIdsVisiveis = productIdsComEstoque.filter(id => visibilidadeMap.has(id));

    if (productIdsVisiveis.length === 0) return { open: true, closedMessage: null, categories: [], products: [] };

    const prods = await db.select({
      id: products.id, name: products.name, categoryId: products.categoryId,
      unit: products.unit, price: products.price, description: products.description, maxFlavors: products.maxFlavors,
    }).from(products).where(and(inArray(products.id, productIdsVisiveis), eq(products.active, true)));

    const categoriaIds = Array.from(new Set(prods.map(p => p.categoryId).filter((v): v is number => v != null)));
    const categorias = categoriaIds.length > 0
      ? await db.select().from(productCategories).where(inArray(productCategories.id, categoriaIds))
      : [];

    // Quantidade total e sabores disponíveis, por produto
    const qtyByProduct: Record<number, number> = {};
    const flavorsByProduct: Record<number, Map<number, string>> = {};
    for (const l of estoqueLinhas) {
      if (!productIdsVisiveis.includes(l.productId)) continue;
      qtyByProduct[l.productId] = (qtyByProduct[l.productId] ?? 0) + l.quantidade;
      const flavors = flavorsByLinha[l.id] ?? [];
      if (flavors.length > 0) {
        const m = (flavorsByProduct[l.productId] ??= new Map());
        for (const f of flavors) m.set(f.id, f.name);
      }
    }

    const productsOut = prods.map(p => {
      const vis = visibilidadeMap.get(p.id);
      return {
        id: p.id, name: p.name, categoryId: p.categoryId, unit: p.unit,
        price: vis?.storePrice ?? p.price,
        description: p.description, maxFlavors: p.maxFlavors ?? 0,
        availableQuantity: qtyByProduct[p.id] ?? 0,
        flavors: Array.from((flavorsByProduct[p.id] ?? new Map()).entries()).map(([id, name]) => ({ id, name })),
      };
    }).filter(p => p.availableQuantity > 0);

    return { open: true, closedMessage: null, categories: categorias, products: productsOut };
  }),

  /** Formas de entrega disponíveis (reaproveita o cadastro já existente) */
  deliveryMethods: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(deliveryMethods).where(eq(deliveryMethods.active, true));
  }),

  /**
   * Cria o pedido da loja pública. Fluxo:
   * 1. Confirma que a loja está aberta e todos os itens ainda têm estoque suficiente.
   * 2. Acha ou cria o cliente por telefone (sem senha).
   * 3. Cria o pedido (channel='loja_publica', paymentStatus='pending') SEM descontar
   *    estoque ainda — o estoque só é descontado quando o pagamento é aprovado
   *    (evita "vender" produto de quem desistiu no meio do pagamento).
   * 4. Cria o pagamento no Mercado Pago (PIX gera QR code na hora; cartão processa
   *    direto com o token vindo do Payment Brick) e devolve pro cliente.
   */
  createOrder: publicProcedure
    .input(z.object({
      customerName: z.string().min(1),
      customerPhone: z.string().min(8),
      deliveryMethodId: z.number(),
      deliveryAddress: z.string().optional(),
      items: z.array(z.object({
        productId: z.number(),
        quantity: z.number().min(1),
        flavorIds: z.array(z.number()).optional(),
      })).min(1, "O carrinho está vazio."),
      paymentMethod: z.enum(["pix", "credit_card"]),
      cardToken: z.string().optional(),
      installments: z.number().optional(),
      paymentMethodId: z.string().optional(),
      issuerId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.paymentMethod === "credit_card" && !mercadoPagoConfigured()) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pagamento por cartão ainda não configurado." });
      }
      if (input.paymentMethod === "pix" && !pixConfigured()) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pagamento por PIX ainda não configurado." });
      }

      const [settings] = await db.select().from(storeSettings).orderBy(desc(storeSettings.id)).limit(1);
      if (!settings?.isOpen) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A loja está fechada no momento." });
      }

      // Confere visibilidade + estoque de cada item, e calcula preços no servidor
      // (nunca confia em preço vindo do cliente).
      const visibilidadeRows = await db.select().from(storeProductVisibility)
        .where(inArray(storeProductVisibility.productId, input.items.map(i => i.productId)));
      const visibilidadeMap = new Map(visibilidadeRows.map(v => [v.productId, v]));

      const produtosRows = await db.select().from(products)
        .where(inArray(products.id, input.items.map(i => i.productId)));
      const produtosMap = new Map(produtosRows.map(p => [p.id, p]));

      let totalAmount = 0;
      const itemsResolved: { productId: number; quantity: number; flavorIds: number[]; unitPrice: number; subtotal: number; nomeItem: string }[] = [];

      for (const item of input.items) {
        const vis = visibilidadeMap.get(item.productId);
        const prod = produtosMap.get(item.productId);
        if (!vis || !vis.visible || !prod || !prod.active) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Item indisponível na loja.` });
        }
        const lotes = await buscarLotesEstoque(db, item.productId, item.flavorIds ?? []);
        const disponivel = lotes.reduce((acc, l) => acc + l.quantity, 0);
        if (disponivel < item.quantity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: disponivel === 0
              ? `"${prod.name}" acabou de esgotar. Atualize a página e tente novamente.`
              : `Só restam ${disponivel} de "${prod.name}" — ajuste a quantidade no carrinho.`,
          });
        }
        const unitPrice = Number(vis.storePrice ?? prod.price);
        const subtotal = unitPrice * item.quantity;
        totalAmount += subtotal;
        itemsResolved.push({ productId: item.productId, quantity: item.quantity, flavorIds: item.flavorIds ?? [], unitPrice, subtotal, nomeItem: prod.name });
      }

      // Acha ou cria o cliente pelo telefone (sem senha, sem login)
      const [existingCustomer] = await db.select().from(customers).where(eq(customers.phone, input.customerPhone)).limit(1);
      let customerId: number;
      if (existingCustomer) {
        customerId = existingCustomer.id;
        if (existingCustomer.name !== input.customerName) {
          await db.update(customers).set({ name: input.customerName }).where(eq(customers.id, customerId));
        }
      } else {
        const result = await db.insert(customers).values({ name: input.customerName, phone: input.customerPhone });
        customerId = Number((result as any)[0]?.insertId ?? (result as any).insertId);
      }

      const systemUserId = await getSystemUserId(db);

      const orderResult = await db.insert(orders).values({
        customerId,
        launcherId: systemUserId,
        deliveryMethodId: input.deliveryMethodId,
        deliveryAddress: input.deliveryAddress,
        paymentMethod: input.paymentMethod,
        channel: "loja_publica",
        status: "production",
        paymentStatus: "pending",
        totalAmount: totalAmount.toFixed(2),
        notes: "Pedido feito pela Loja Pública (on-line)",
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
      }

      await db.insert(orderStatusHistory).values({
        orderId, userId: systemUserId, fromStatus: null, toStatus: "production",
        notes: "Pedido criado pela Loja Pública",
      });

      // Cria o "pagamento": PIX é gerado localmente (BR Code direto pro CNPJ,
      // sem nenhum gateway) — fica pendente até alguém confirmar manualmente
      // no painel. Cartão continua indo pro Mercado Pago (Payment Brick), que
      // aprova (ou não) na hora.
      try {
        if (input.paymentMethod === "pix") {
          const payload = buildPixPayload({ amount: totalAmount, txid: `pedido${orderId}` });
          const qrCodeBase64 = await generatePixQrCodeBase64(payload);

          await db.insert(storeOrderPayments).values({
            orderId, method: "pix", status: "pending",
            qrCode: payload, qrCodeBase64,
            amount: totalAmount.toFixed(2),
          });

          return { success: true, orderId, paymentStatus: "pending", qrCode: payload, qrCodeBase64 };
        }

        const mpResult = await createMercadoPagoPayment({
          orderId, amount: totalAmount, method: input.paymentMethod,
          customerName: input.customerName, customerEmail: `${input.customerPhone.replace(/\D/g, "")}@loja.integrarte.app.br`,
          cardToken: input.cardToken, installments: input.installments,
          paymentMethodId: input.paymentMethodId, issuerId: input.issuerId,
        });

        await db.insert(storeOrderPayments).values({
          orderId, method: input.paymentMethod,
          status: mpResult.status === "approved" ? "approved" : "pending",
          mpPaymentId: mpResult.mpPaymentId,
          qrCode: mpResult.qrCode, qrCodeBase64: mpResult.qrCodeBase64,
          amount: totalAmount.toFixed(2),
          approvedAt: mpResult.status === "approved" ? new Date() : undefined,
        });

        if (mpResult.status === "approved") {
          await db.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, orderId));
          for (const item of itemsResolved) {
            const lotes = await buscarLotesEstoque(db, item.productId, item.flavorIds);
            await descontarLotesEstoque(db, lotes, item.quantity);
          }
        }

        return {
          success: true, orderId,
          paymentStatus: mpResult.status,
          qrCode: mpResult.qrCode, qrCodeBase64: mpResult.qrCodeBase64,
        };
      } catch (err: any) {
        console.error("Erro ao criar pagamento no Mercado Pago:", err);
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível processar o pagamento. Verifique os dados e tente novamente." });
      }
    }),

  /** Status do pedido/pagamento — usado pela tela de recibo para saber quando confirmou */
  orderStatus: publicProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [order] = await db.select({
        id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus,
        totalAmount: orders.totalAmount, createdAt: orders.createdAt,
        deliveryMethodId: orders.deliveryMethodId,
        customerName: customers.name,
      }).from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(eq(orders.id, input.orderId), eq(orders.channel, "loja_publica")))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      const [payment] = await db.select().from(storeOrderPayments).where(eq(storeOrderPayments.orderId, input.orderId)).limit(1);

      const items = await db.select({
        productName: products.name, quantity: orderItems.quantity, subtotal: orderItems.subtotal,
      }).from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(eq(orderItems.orderId, input.orderId));

      return { ...order, payment: payment ?? null, items };
    }),
});
