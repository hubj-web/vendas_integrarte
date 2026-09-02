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
import { nanoid } from "nanoid";
import {
  customers, deliveryMethods, orderItems, orderItemFlavors, orders, orderStatusHistory,
  productCategories, productFlavors, products, storeOrderPayments,
  storeProductVisibility, storeSettings, users, estoqueAtual, estoqueAtualFlavors,
  storeDeliveryMethodVisibility, storeEvents, storeEventCategories,
  storeRegularCategoryVisibility, productVariationGroups, productVariationOptions,
  orderItemVariationSelections,
  paymentMethods, storeRegularPaymentMethodVisibility, storeEventPaymentMethodVisibility,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { buscarLotesEstoque, descontarLotesEstoque } from "./seller";
import { sendReceiptEmail } from "../email";
import { createMercadoPagoPayment, mercadoPagoConfigured } from "../mercadopago";
import { generateQrCodeBase64 } from "../qr";
import { ENV } from "../_core/env";

/**
 * "Aberto de verdade": combina o interruptor manual com a janela de venda
 * automática (Campanha), se houver uma definida.
 *  - Sem datas definidas: exatamente o valor do interruptor (comportamento de sempre).
 *  - Com datas definidas: só fica aberto se o interruptor estiver ligado E o
 *    momento atual estiver dentro da janela — desligar o interruptor sempre
 *    fecha (serve pra fechar antes da hora, por exceção).
 */
export function isEffectivelyOpen(row: { isOpen: boolean; saleStartsAt?: Date | null; saleEndsAt?: Date | null }): boolean {
  if (!row.isOpen) return false;
  if (!row.saleStartsAt && !row.saleEndsAt) return true;
  const now = Date.now();
  if (row.saleStartsAt && now < row.saleStartsAt.getTime()) return false;
  if (row.saleEndsAt && now > row.saleEndsAt.getTime()) return false;
  return true;
}

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

/**
 * Monta o catálogo (categorias + produtos disponíveis) — compartilhado entre a
 * Venda Regular e os Eventos. `categoryIdFilter` restringe a um conjunto de
 * categorias específico (usado pelos eventos); undefined = todas.
 */
async function buildCatalog(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  categoryIdFilter?: number[],
  excludeCategoryIds?: number[],
) {
  const now = new Date();

  const estoqueLinhas = await db.select({
    id: estoqueAtual.id, productId: estoqueAtual.productId, quantidade: estoqueAtual.quantidade,
  }).from(estoqueAtual).where(gte(estoqueAtual.quantidade, 1));

  const estoqueIds = estoqueLinhas.map(l => l.id);
  const flavorRows = estoqueIds.length > 0
    ? await db.select({
        estoqueAtualId: estoqueAtualFlavors.estoqueAtualId, productFlavorId: estoqueAtualFlavors.productFlavorId, flavorName: estoqueAtualFlavors.flavorName,
      }).from(estoqueAtualFlavors).where(inArray(estoqueAtualFlavors.estoqueAtualId, estoqueIds))
    : [];
  const flavorsByLinha: Record<number, { id: number; name: string }[]> = {};
  for (const f of flavorRows) (flavorsByLinha[f.estoqueAtualId] ??= []).push({ id: f.productFlavorId, name: f.flavorName });

  const productIdsComEstoque = Array.from(new Set(estoqueLinhas.map(l => l.productId)));

  // Todo produto marcado visível na loja — não só quem tem estoque, porque
  // um "sob encomenda" pode aparecer mesmo sem estoque nenhum.
  const visibilidade = await db.select().from(storeProductVisibility).where(eq(storeProductVisibility.visible, true));
  const visibilidadeMap = new Map(visibilidade.map(v => [v.productId, v]));
  const visibleProductIds = visibilidade.map(v => v.productId);

  if (visibleProductIds.length === 0) return { categories: [], products: [] };

  const prodConditions = [inArray(products.id, visibleProductIds), eq(products.active, true)];
  if (categoryIdFilter) prodConditions.push(inArray(products.categoryId, categoryIdFilter));

  const prods = await db.select({
    id: products.id, name: products.name, categoryId: products.categoryId,
    unit: products.unit, price: products.price, description: products.description,
    maxFlavors: products.maxFlavors, variationType: products.variationType, imageUrl: products.imageUrl,
    displaySize: products.displaySize, allowPreOrder: products.allowPreOrder, preOrderUntil: products.preOrderUntil,
  }).from(products).where(and(...prodConditions));

  /** Sob encomenda: ligado, e (sem data de corte OU ainda antes dela). */
  const isProductOnPreOrder = (p: { allowPreOrder: boolean; preOrderUntil: Date | null }) =>
    p.allowPreOrder && (!p.preOrderUntil || now <= p.preOrderUntil);

  // Produto entra no catálogo se: tem estoque de verdade, OU está na janela de sob encomenda.
  const productIdsVisiveis = prods
    .filter(p => productIdsComEstoque.includes(p.id) || isProductOnPreOrder(p))
    .map(p => p.id);

  const prodsFiltered = (excludeCategoryIds && excludeCategoryIds.length > 0
    ? prods.filter(p => !p.categoryId || !excludeCategoryIds.includes(p.categoryId))
    : prods
  ).filter(p => productIdsVisiveis.includes(p.id));

  const categoriaIds = Array.from(new Set(prodsFiltered.map(p => p.categoryId).filter((v): v is number => v != null)));
  const categoriasBrutas = categoriaIds.length > 0
    ? await db.select().from(productCategories).where(inArray(productCategories.id, categoriaIds))
    : [];

  // Categoria fora da janela de disponibilidade (se ela tiver uma definida)
  // não aparece, mesmo que os produtos dela estejam tudo certo por dentro.
  const categoriaDisponivelAgora = (c: { availableFrom: Date | null; availableUntil: Date | null }) =>
    (!c.availableFrom || now >= c.availableFrom) && (!c.availableUntil || now <= c.availableUntil);
  const categorias = categoriasBrutas.filter(categoriaDisponivelAgora);
  const categoriaIdsDisponiveis = new Set(categorias.map(c => c.id));
  const prodsFinal = prodsFiltered.filter(p => !p.categoryId || categoriaIdsDisponiveis.has(p.categoryId));

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

  // Grupos de variação múltipla (tipo de macarrão + molho + condimentos, etc.)
  const groups = await db.select().from(productVariationGroups).where(inArray(productVariationGroups.productId, prodsFinal.map(p => p.id)));
  const groupIds = groups.map(g => g.id);
  const options = groupIds.length > 0
    ? await db.select().from(productVariationOptions).where(inArray(productVariationOptions.groupId, groupIds))
    : [];
  const optionsByGroup: Record<number, typeof options> = {};
  for (const o of options) (optionsByGroup[o.groupId] ??= []).push(o);
  const groupsByProduct: Record<number, typeof groups> = {};
  for (const g of groups) (groupsByProduct[g.productId] ??= []).push(g);

  const productsOut = prodsFinal.map(p => {
    const vis = visibilidadeMap.get(p.id);
    const isPreOrder = isProductOnPreOrder(p);
    return {
      id: p.id, name: p.name, categoryId: p.categoryId, unit: p.unit,
      price: vis?.storePrice ?? p.price,
      description: p.description, maxFlavors: p.maxFlavors ?? 0,
      variationType: p.variationType, imageUrl: p.imageUrl, displaySize: p.displaySize,
      isPreOrder,
      // Sob encomenda = sem limite de estoque; senão, é a quantidade real.
      availableQuantity: isPreOrder ? Number.MAX_SAFE_INTEGER : (qtyByProduct[p.id] ?? 0),
      flavors: Array.from((flavorsByProduct[p.id] ?? new Map()).entries()).map(([id, name]) => ({ id, name })),
      variationGroups: (groupsByProduct[p.id] ?? []).map(g => ({
        id: g.id, name: g.name, required: g.required, allowMultiple: g.allowMultiple,
        options: (optionsByGroup[g.id] ?? []).map(o => ({ id: o.id, name: o.name, additionalPrice: o.additionalPrice })),
      })),
    };
  }).filter(p => p.availableQuantity > 0);

  return { categories: categorias, products: productsOut };
}

export const publicStoreRouter = router({
  /** Chave PÚBLICA do Mercado Pago (nunca o access token) — usada pelo Payment Brick no navegador. */
  mpPublicKey: publicProcedure.query(() => ({
    publicKey: ENV.mercadoPagoPublicKey,
    configured: mercadoPagoConfigured() && !!ENV.mercadoPagoPublicKey,
  })),

  /**
   * Tela inicial: o que está disponível pra escolher agora — a Venda Regular
   * (se aberta) e/ou Eventos ativos (baile, festa...). O cliente entra direto
   * se só tiver uma opção; escolhe entre elas se tiver mais de uma.
   */
  landing: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { regularOpen: false, regularClosedMessage: null, events: [] };

    const [settings] = await db.select().from(storeSettings).orderBy(desc(storeSettings.id)).limit(1);
    const allEvents = await db.select().from(storeEvents).orderBy(storeEvents.sortOrder);
    const events = allEvents.filter(isEffectivelyOpen);

    return {
      regularOpen: !!settings && isEffectivelyOpen(settings),
      regularClosedMessage: settings?.closedMessage ?? null,
      storeTitle: settings?.storeTitle || "LOJA INTEGRARTE",
      welcomeMessage: settings?.welcomeMessage ||
        "Olá... que bom ter você aqui. Nossa loja existe exclusivamente para o bem. Todos os nossos produtos têm verba revertida para atividades artísticas ou culturais. Escolha o que você quer ver:",
      primaryColor: settings?.primaryColor || "#1E4B9C",
      events: events.map(e => ({
        id: e.id, name: e.name, type: e.type, description: e.description,
        imageUrl: e.imageUrl, eventDate: e.eventDate,
      })),
    };
  }),

  /** Catálogo da Venda Regular — só estoque disponível + marcado visível na loja. */
  catalog: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { open: false, closedMessage: null, categories: [], products: [] };

    const [settings] = await db.select().from(storeSettings).orderBy(desc(storeSettings.id)).limit(1);
    if (!settings || !isEffectivelyOpen(settings)) {
      return { open: false, closedMessage: settings?.closedMessage ?? null, categories: [], products: [] };
    }

    // Categoria vinculada a algum evento não aparece na Venda Regular por
    // padrão (evita "Ingressos" ou coisas de evento se misturarem com a loja
    // de sempre) — a menos que alguém libere ela explicitamente na aba
    // "Venda Regular" do painel. Categoria que nunca foi ligada a evento
    // nenhum continua aparecendo normalmente, como sempre.
    const visRows = await db.select().from(storeRegularCategoryVisibility);
    const explicitlyVisible = new Set(visRows.filter(v => v.visible).map(v => v.categoryId));
    const explicitlyHidden = new Set(visRows.filter(v => !v.visible).map(v => v.categoryId));

    const eventLinks = await db.select({ categoryId: storeEventCategories.categoryId }).from(storeEventCategories);
    const eventLinkedCategoryIds = new Set(eventLinks.map(l => l.categoryId));

    const hiddenCategoryIds = Array.from(eventLinkedCategoryIds).filter(id => !explicitlyVisible.has(id));
    for (const id of Array.from(explicitlyHidden)) if (!hiddenCategoryIds.includes(id)) hiddenCategoryIds.push(id);

    const { categories, products: productsOut } = await buildCatalog(db, undefined, hiddenCategoryIds);
    return { open: true, closedMessage: null, categories, products: productsOut };
  }),

  /** Catálogo de um Evento específico — só as categorias vinculadas a ele. */
  eventCatalog: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [event] = await db.select().from(storeEvents).where(eq(storeEvents.id, input.eventId)).limit(1);
      if (!event || !isEffectivelyOpen(event)) {
        return { open: false, event: null, categories: [], products: [] };
      }

      const links = await db.select({ categoryId: storeEventCategories.categoryId }).from(storeEventCategories).where(eq(storeEventCategories.eventId, input.eventId));
      const categoryIds = links.map(l => l.categoryId);
      if (categoryIds.length === 0) return { open: true, event, categories: [], products: [] };

      const { categories, products: productsOut } = await buildCatalog(db, categoryIds);
      return { open: true, event, categories, products: productsOut };
    }),

  /**
   * Formas de entrega disponíveis na loja (reaproveita o cadastro já existente,
   * mas respeita o "desligar na loja" configurado no painel — por padrão toda
   * forma ativa aparece, a menos que tenha sido explicitamente ocultada).
   */
  deliveryMethods: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const all = await db.select().from(deliveryMethods).where(eq(deliveryMethods.active, true));
    const hiddenRows = await db.select({ deliveryMethodId: storeDeliveryMethodVisibility.deliveryMethodId })
      .from(storeDeliveryMethodVisibility).where(eq(storeDeliveryMethodVisibility.visible, false));
    const hiddenIds = new Set(hiddenRows.map(h => h.deliveryMethodId));
    return all.filter(m => !hiddenIds.has(m.id));
  }),

  /**
   * Formas de pagamento disponíveis (PIX e/ou Cartão) — na Venda Regular ou
   * num Evento específico. Sempre parte das formas ativas globalmente; dentro
   * disso, aplica a visibilidade específica do contexto (opt-out).
   */
  paymentMethods: publicProcedure
    .input(z.object({ eventId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { pix: false, creditCard: false };
      const methods = await db.select().from(paymentMethods)
        .where(and(eq(paymentMethods.active, true), inArray(paymentMethods.code, ["pix_loja", "cartao_loja"])));

      let hiddenIds = new Set<number>();
      if (input?.eventId) {
        const rows = await db.select({ paymentMethodId: storeEventPaymentMethodVisibility.paymentMethodId })
          .from(storeEventPaymentMethodVisibility)
          .where(and(eq(storeEventPaymentMethodVisibility.eventId, input.eventId), eq(storeEventPaymentMethodVisibility.visible, false)));
        hiddenIds = new Set(rows.map(r => r.paymentMethodId));
      } else {
        const rows = await db.select({ paymentMethodId: storeRegularPaymentMethodVisibility.paymentMethodId })
          .from(storeRegularPaymentMethodVisibility).where(eq(storeRegularPaymentMethodVisibility.visible, false));
        hiddenIds = new Set(rows.map(r => r.paymentMethodId));
      }

      const available = methods.filter(m => !hiddenIds.has(m.id));
      return {
        pix: available.some(m => m.code === "pix_loja"),
        creditCard: available.some(m => m.code === "cartao_loja"),
      };
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
      customerEmail: z.string().email().optional(),
      deliveryMethodId: z.number(),
      deliveryAddress: z.string().optional(),
      eventId: z.number().optional(), // presente = compra dentro de um Evento; ausente = Venda Regular
      items: z.array(z.object({
        productId: z.number(),
        quantity: z.number().min(1),
        flavorIds: z.array(z.number()).optional(),
        optionIds: z.array(z.number()).optional(), // grupos de variação múltipla escolhidos
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
      if ((input.paymentMethod === "credit_card" || input.paymentMethod === "pix") && !mercadoPagoConfigured()) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pagamento ainda não configurado." });
      }

      let allowedCategoryIds: number[] | null = null;
      if (input.eventId) {
        const [event] = await db.select().from(storeEvents).where(eq(storeEvents.id, input.eventId)).limit(1);
        if (!event || !isEffectivelyOpen(event)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este evento não está mais disponível." });
        }
        const links = await db.select({ categoryId: storeEventCategories.categoryId }).from(storeEventCategories).where(eq(storeEventCategories.eventId, input.eventId));
        allowedCategoryIds = links.map(l => l.categoryId);
      } else {
        const [settings] = await db.select().from(storeSettings).orderBy(desc(storeSettings.id)).limit(1);
        if (!settings || !isEffectivelyOpen(settings)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A loja está fechada no momento." });
        }
      }

      // Confere que a forma de pagamento escolhida está mesmo liberada nesse
      // contexto (Venda Regular ou este Evento) — nunca confia só no que o
      // cliente mandou.
      {
        const allMethods = await db.select().from(paymentMethods)
          .where(and(eq(paymentMethods.active, true), inArray(paymentMethods.code, ["pix_loja", "cartao_loja"])));
        const wantedCode = input.paymentMethod === "pix" ? "pix_loja" : "cartao_loja";
        const method = allMethods.find(m => m.code === wantedCode);
        let hidden = false;
        if (method) {
          if (input.eventId) {
            const [row] = await db.select({ visible: storeEventPaymentMethodVisibility.visible }).from(storeEventPaymentMethodVisibility)
              .where(and(eq(storeEventPaymentMethodVisibility.eventId, input.eventId), eq(storeEventPaymentMethodVisibility.paymentMethodId, method.id))).limit(1);
            hidden = row ? !row.visible : false;
          } else {
            const [row] = await db.select({ visible: storeRegularPaymentMethodVisibility.visible }).from(storeRegularPaymentMethodVisibility)
              .where(eq(storeRegularPaymentMethodVisibility.paymentMethodId, method.id)).limit(1);
            hidden = row ? !row.visible : false;
          }
        }
        if (!method || hidden) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Essa forma de pagamento não está disponível aqui." });
        }
      }

      // Confere visibilidade + estoque de cada item, e calcula preços no servidor
      // (nunca confia em preço vindo do cliente).
      const visibilidadeRows = await db.select().from(storeProductVisibility)
        .where(inArray(storeProductVisibility.productId, input.items.map(i => i.productId)));
      const visibilidadeMap = new Map(visibilidadeRows.map(v => [v.productId, v]));

      const produtosRows = await db.select().from(products)
        .where(inArray(products.id, input.items.map(i => i.productId)));
      const produtosMap = new Map(produtosRows.map(p => [p.id, p]));

      const now = new Date();

      let totalAmount = 0;
      const itemsResolved: {
        productId: number; quantity: number; flavorIds: number[]; unitPrice: number; subtotal: number; nomeItem: string;
        selections: { groupName: string; optionName: string; additionalPrice: number }[];
        isPreOrder: boolean;
      }[] = [];

      for (const item of input.items) {
        const vis = visibilidadeMap.get(item.productId);
        const prod = produtosMap.get(item.productId);
        if (!vis || !vis.visible || !prod || !prod.active) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Item indisponível na loja.` });
        }
        if (allowedCategoryIds && (!prod.categoryId || !allowedCategoryIds.includes(prod.categoryId))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `"${prod.name}" não pertence a este evento.` });
        }

        // Item "sob encomenda" (dentro da janela configurada nele, se houver
        // uma) não precisa de estoque — é registrado sem checar/descontar
        // nada. Fora dessa janela, cai na regra normal (precisa estoque real).
        const isPreOrder = prod.allowPreOrder && (!prod.preOrderUntil || now <= prod.preOrderUntil);
        if (!isPreOrder) {
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
        }

        // Grupos de variação múltipla (tipo de macarrão, molho, condimentos...) —
        // confere que todo grupo obrigatório foi respondido e calcula o adicional.
        const groups = await db.select().from(productVariationGroups).where(eq(productVariationGroups.productId, item.productId));
        let additionalPrice = 0;
        const selections: { groupName: string; optionName: string; additionalPrice: number }[] = [];
        if (groups.length > 0) {
          const optionIds = item.optionIds ?? [];
          const allOptions = await db.select().from(productVariationOptions).where(inArray(productVariationOptions.groupId, groups.map(g => g.id)));
          for (const group of groups) {
            const groupOptions = allOptions.filter(o => o.groupId === group.id);
            const chosen = groupOptions.filter(o => optionIds.includes(o.id));
            if (group.required && chosen.length === 0) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `Escolha "${group.name}" em "${prod.name}".` });
            }
            if (!group.allowMultiple && chosen.length > 1) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `Só pode escolher uma opção em "${group.name}".` });
            }
            for (const opt of chosen) {
              additionalPrice += Number(opt.additionalPrice);
              selections.push({ groupName: group.name, optionName: opt.name, additionalPrice: Number(opt.additionalPrice) });
            }
          }
        }

        const unitPrice = Number(vis.storePrice ?? prod.price) + additionalPrice;
        const subtotal = unitPrice * item.quantity;
        totalAmount += subtotal;
        itemsResolved.push({ productId: item.productId, quantity: item.quantity, flavorIds: item.flavorIds ?? [], unitPrice, subtotal, nomeItem: prod.name, selections, isPreOrder });
      }

      // Soma o custo da forma de entrega escolhida (quando tiver) no total.
      const [chosenDeliveryMethod] = await db.select({ cost: deliveryMethods.cost, name: deliveryMethods.name })
        .from(deliveryMethods).where(eq(deliveryMethods.id, input.deliveryMethodId)).limit(1);
      const deliveryCost = Number(chosenDeliveryMethod?.cost ?? 0);
      totalAmount += deliveryCost;

      // Acha ou cria o cliente pelo telefone (sem senha, sem login)
      const [existingCustomer] = await db.select().from(customers).where(eq(customers.phone, input.customerPhone)).limit(1);
      let customerId: number;
      if (existingCustomer) {
        customerId = existingCustomer.id;
        if (existingCustomer.name !== input.customerName || (input.customerEmail && existingCustomer.email !== input.customerEmail)) {
          await db.update(customers).set({ name: input.customerName, ...(input.customerEmail ? { email: input.customerEmail } : {}) }).where(eq(customers.id, customerId));
        }
      } else {
        const result = await db.insert(customers).values({ name: input.customerName, phone: input.customerPhone, email: input.customerEmail });
        customerId = Number((result as any)[0]?.insertId ?? (result as any).insertId);
      }

      const systemUserId = await getSystemUserId(db);
      const ticketCode = nanoid(12);

      const orderResult = await db.insert(orders).values({
        customerId,
        launcherId: systemUserId,
        deliveryMethodId: input.deliveryMethodId,
        deliveryAddress: input.deliveryAddress,
        paymentMethod: input.paymentMethod,
        channel: "loja_publica",
        eventId: input.eventId,
        ticketCode,
        status: "production",
        paymentStatus: "pending",
        totalAmount: totalAmount.toFixed(2),
        notes: "Pedido feito pela Loja Pública (on-line)",
      });
      const orderId = Number((orderResult as any)[0]?.insertId ?? (orderResult as any).insertId);

      // Manda o recibo por e-mail, se o cliente informou um — não trava o
      // pedido se o envio falhar (sistema de e-mail fora do ar, etc.)
      if (input.customerEmail) {
        try {
          let isTicket = false;
          if (input.eventId) {
            const [ev] = await db.select({ type: storeEvents.type }).from(storeEvents).where(eq(storeEvents.id, input.eventId)).limit(1);
            isTicket = ev?.type === "ingresso";
          }
          await sendReceiptEmail({
            to: input.customerEmail, customerName: input.customerName, ticketCode,
            totalAmount: totalAmount.toFixed(2), isTicket,
          });
        } catch (err) {
          console.error("Erro ao enviar e-mail do recibo (pedido segue normalmente):", err);
        }
      }

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
        if (item.selections.length > 0) {
          await db.insert(orderItemVariationSelections).values(item.selections.map(s => ({
            orderItemId, groupName: s.groupName, optionName: s.optionName, additionalPrice: s.additionalPrice.toFixed(2),
          })));
        }
      }

      await db.insert(orderStatusHistory).values({
        orderId, userId: systemUserId, fromStatus: null, toStatus: "production",
        notes: "Pedido criado pela Loja Pública",
      });

      // Cria o pagamento no Mercado Pago — tanto PIX quanto Cartão passam pelo
      // mesmo gateway agora, com confirmação automática via webhook (assim
      // que o cliente paga, o pedido já vira "pago" e o estoque já desconta,
      // sem precisar de ninguém confirmar manualmente no painel).
      try {
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
            if (item.isPreOrder) continue; // sob encomenda: não desconta estoque, não tem o que descontar
            const lotes = await buscarLotesEstoque(db, item.productId, item.flavorIds);
            await descontarLotesEstoque(db, lotes, item.quantity);
          }
        }

        return {
          success: true, orderId, ticketCode,
          paymentStatus: mpResult.status,
          qrCode: mpResult.qrCode, qrCodeBase64: mpResult.qrCodeBase64,
        };
      } catch (err: any) {
        console.error("Erro ao criar pagamento no Mercado Pago:", err);
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível processar o pagamento. Verifique os dados e tente novamente." });
      }
    }),

  /** Status do pedido/pagamento — usado pela tela de recibo (via id numérico, uso interno logo após criar) */
  orderStatus: publicProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      return resolveOrderDetails(db, eq(orders.id, input.orderId));
    }),

  /**
   * Recibo/ingresso pelo código público (usado no link/QR compartilhado —
   * nunca expõe o id numérico sequencial do pedido).
   */
  orderByTicketCode: publicProcedure
    .input(z.object({ ticketCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ticketCode, input.ticketCode)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Ingresso/recibo não encontrado." });
      return resolveOrderDetails(db, eq(orders.ticketCode, input.ticketCode));
    }),

  // ── CHECK-IN (leitura de ingresso/comprovante na entrada do evento) ─────
  // Sem login — liberado por um código curto por evento, pra voluntários.

  /** Confere o código de acesso e devolve o nome do evento, pra mostrar na tela. */
  checkInVerifyCode: publicProcedure
    .input(z.object({ eventId: z.number(), code: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { valid: false, eventName: null };
      const [ev] = await db.select({ name: storeEvents.name, checkInCode: storeEvents.checkInCode })
        .from(storeEvents).where(eq(storeEvents.id, input.eventId)).limit(1);
      if (!ev || !ev.checkInCode || ev.checkInCode !== input.code) return { valid: false, eventName: null };
      return { valid: true, eventName: ev.name };
    }),

  /** Lê um ingresso/comprovante — marca como usado (ou avisa que já foi, deixando prosseguir mesmo assim). */
  checkInTicket: publicProcedure
    .input(z.object({ eventId: z.number(), code: z.string(), ticketCode: z.string(), forceAllow: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [ev] = await db.select({ checkInCode: storeEvents.checkInCode }).from(storeEvents).where(eq(storeEvents.id, input.eventId)).limit(1);
      if (!ev || !ev.checkInCode || ev.checkInCode !== input.code) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Código de acesso inválido." });
      }

      const [order] = await db.select({
        id: orders.id, eventId: orders.eventId, checkedInAt: orders.checkedInAt, customerId: orders.customerId,
      }).from(orders).where(eq(orders.ticketCode, input.ticketCode)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Ingresso/comprovante não encontrado." });
      if (order.eventId !== input.eventId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esse ingresso não é desse evento." });
      }

      const [customer] = order.customerId
        ? await db.select({ name: customers.name }).from(customers).where(eq(customers.id, order.customerId)).limit(1)
        : [null];
      const items = await db.select({ productName: products.name, quantity: orderItems.quantity })
        .from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(eq(orderItems.orderId, order.id));

      const alreadyUsed = !!order.checkedInAt;
      if (!alreadyUsed || input.forceAllow) {
        if (!alreadyUsed) await db.update(orders).set({ checkedInAt: new Date() }).where(eq(orders.id, order.id));
      }

      return {
        success: true, alreadyUsed, checkedInAt: order.checkedInAt,
        customerName: customer?.name ?? null,
        items: items.map(i => `${i.quantity}x ${i.productName}`),
      };
    }),
});

async function resolveOrderDetails(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, whereClause: any) {
  const [order] = await db.select({
    id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus,
    totalAmount: orders.totalAmount, createdAt: orders.createdAt,
    deliveryMethodId: orders.deliveryMethodId, eventId: orders.eventId, ticketCode: orders.ticketCode,
    customerName: customers.name, deliveryMethodName: deliveryMethods.name, deliveryCost: deliveryMethods.cost,
  }).from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
    .where(whereClause)
    .limit(1);
  if (!order) throw new TRPCError({ code: "NOT_FOUND" });

  const [payment] = await db.select().from(storeOrderPayments).where(eq(storeOrderPayments.orderId, order.id)).limit(1);

  const items = await db.select({
    id: orderItems.id, productName: products.name, quantity: orderItems.quantity, subtotal: orderItems.subtotal,
  }).from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(eq(orderItems.orderId, order.id));

  const itemIds = items.map(i => i.id);
  const selections = itemIds.length > 0
    ? await db.select().from(orderItemVariationSelections).where(inArray(orderItemVariationSelections.orderItemId, itemIds))
    : [];
  const selectionsByItem: Record<number, { groupName: string; optionName: string }[]> = {};
  for (const s of selections) (selectionsByItem[s.orderItemId] ??= []).push({ groupName: s.groupName, optionName: s.optionName });

  const itemsWithSelections = items.map(i => ({ ...i, selections: selectionsByItem[i.id] ?? [] }));

  let event: typeof storeEvents.$inferSelect | null = null;
  if (order.eventId) {
    const [ev] = await db.select().from(storeEvents).where(eq(storeEvents.id, order.eventId)).limit(1);
    event = ev ?? null;
  }

  const receiptUrl = order.ticketCode ? `${ENV.appUrl}/loja/r/${order.ticketCode}` : null;
  const receiptQrBase64 = receiptUrl ? await generateQrCodeBase64(receiptUrl) : null;

  return { ...order, payment: payment ?? null, items: itemsWithSelections, event, receiptUrl, receiptQrBase64 };
}
