/**
 * Router da Área do Entregador.
 * Requer login com usuário e senha (mesmo sistema de autenticação do admin/vendedor).
 * O entregador só acessa suas próprias rotas — identificado pela sessão autenticada
 * (ctx.user.id), nunca por um ID informado pelo cliente.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import {
  customers, deliveryRecords, routeOrders, deliveryRoutes,
  orders, users, deliveryMethods, orderStatusHistory,
  orderItems, orderItemFlavors, products,
  orderMinipizzas, orderMinipizzaFlavors, minipizzaTypes, minipizzaFlavors,
  orderJellies, jellyFlavors,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import type { TrpcContext } from "../_core/context";

// Motivos pré-definidos para entrega não realizada
export const UNDELIVERED_REASONS = {
  endereco_nao_identificado: "Endereço não identificado",
  falta_info_complemento: "Faltou informação de apartamento/complemento",
  cliente_ausente: "Cliente não estava na residência",
  recusou_recebimento: "Cliente recusou receber",
  outro: "Outro motivo",
} as const;
export type UndeliveredReason = keyof typeof UNDELIVERED_REASONS;

// Helper: garante que o usuário autenticado tem função de entregador (função
// principal OU secundária) — nunca confia num ID vindo do cliente.
function requireDeliveryRole(ctx: TrpcContext) {
  const user = ctx.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  let hasDeliveryRole = user.role === "delivery" || user.role === "admin";
  if (!hasDeliveryRole) {
    try {
      const parsed = JSON.parse(user.roles ?? "[]");
      hasDeliveryRole = Array.isArray(parsed) && parsed.includes("delivery");
    } catch {
      hasDeliveryRole = false;
    }
  }
  if (!hasDeliveryRole) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a entregadores." });
  }
  return user;
}

/**
 * Monta o endereço completo de um pedido para uso no Google Maps.
 * Usa apenas rua, número, bairro, cidade e CEP — sem referência ou complemento.
 */
function buildAddress(item: {
  deliveryAddress: string | null;
  customerStreet: string | null;
  customerNumber: string | null;
  customerNeighborhood: string | null;
  customerCity: string | null;
  customerZipCode?: string | null;
}): string {
  // Primeiro tenta montar com campos estruturados (mais confiável para o Maps)
  const parts = [item.customerStreet, item.customerNumber, item.customerNeighborhood, item.customerCity].filter(Boolean);
  if (item.customerZipCode) parts.push(item.customerZipCode);
  if (parts.length > 0) return parts.join(", ");
  
  // Fallback: deliveryAddress, mas limpando referências entre parênteses
  if (item.deliveryAddress && item.deliveryAddress.trim()) {
    return item.deliveryAddress.replace(/\s*\([^)]*\)/g, "").trim();
  }
  
  return "";
}

/** Endereço para EXIBIR ao entregador (inclui complemento — apto, bloco, etc.).
 * Diferente de buildAddress(), que é usado só para montar o link do Maps e por
 * isso omite complemento de propósito (atrapalharia a geocodificação). */
function buildDisplayAddress(item: {
  deliveryAddress: string | null;
  customerStreet: string | null;
  customerNumber: string | null;
  customerComplement?: string | null;
  customerNeighborhood: string | null;
  customerCity: string | null;
  customerZipCode?: string | null;
}): string {
  // Prioriza o endereço estruturado do cadastro do cliente (rua + número são o dado
  // mais confiável, mantido atualizado na tela de Clientes). O "deliveryAddress" do
  // pedido é texto livre digitado na hora da venda e pode estar incompleto (ex: sem
  // o número) — por isso só é usado como fallback.
  if (item.customerStreet && item.customerNumber) {
    const parts = [
      `${item.customerStreet}, ${item.customerNumber}`,
      item.customerComplement, item.customerNeighborhood, item.customerCity, item.customerZipCode,
    ].filter(Boolean);
    return parts.join(", ");
  }
  if (item.deliveryAddress && item.deliveryAddress.trim()) {
    const base = item.deliveryAddress.trim();
    if (item.customerComplement && !base.toLowerCase().includes(item.customerComplement.toLowerCase())) {
      return `${base} — ${item.customerComplement}`;
    }
    return base;
  }
  const parts = [
    item.customerStreet, item.customerComplement, item.customerNeighborhood, item.customerCity, item.customerZipCode,
  ].filter(Boolean);
  return parts.join(", ");
}

export const deliveryPublicRouter = router({
  /**
   * Rotas atribuídas ao entregador autenticado.
   * Mostra rotas planejadas, em andamento e as últimas concluídas (até 5).
   */
  myRoutes: protectedProcedure
    .query(async ({ ctx }) => {
      const user = requireDeliveryRole(ctx);
      const db = await getDb();
      if (!db) return [];

      // Busca todas as rotas do entregador (planejadas + em andamento + concluídas recentes)
      const allRoutes = await db
        .select({
          id: deliveryRoutes.id,
          name: deliveryRoutes.name,
          deliveryDate: deliveryRoutes.deliveryDate,
          status: deliveryRoutes.status,
          totalDistance: deliveryRoutes.totalDistance,
          createdAt: deliveryRoutes.createdAt,
        })
        .from(deliveryRoutes)
        .where(eq(deliveryRoutes.deliveryUserId, user.id))
        .orderBy(desc(deliveryRoutes.deliveryDate));

      // Prioriza rotas ativas (planned/in_progress) e inclui as últimas 5 concluídas
      const active = allRoutes.filter(r => r.status === "planned" || r.status === "in_progress");
      const completed = allRoutes.filter(r => r.status === "completed").slice(0, 5);

      return [...active, ...completed];
    }),

  /**
   * Detalhes de uma rota com os pedidos e URL do Google Maps.
   * Usa endereços completos (rua + número + bairro + cidade) para o Maps.
   */
  routeDetail: protectedProcedure
    .input(z.object({ routeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const user = requireDeliveryRole(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const route = await db
        .select()
        .from(deliveryRoutes)
        .where(
          and(
            eq(deliveryRoutes.id, input.routeId),
            eq(deliveryRoutes.deliveryUserId, user.id)
          )
        )
        .limit(1);

      if (!route[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const items = await db
        .select({
          id: routeOrders.id,
          orderId: routeOrders.orderId,
          position: routeOrders.position,
          distanceFromPrevious: routeOrders.distanceFromPrevious,
          customerName: customers.name,
          customerPhone: customers.phone,
          customerStreet: customers.street,
          customerNumber: customers.number,
          customerComplement: customers.complement,
          customerNeighborhood: customers.neighborhood,
          customerCity: customers.city,
          customerZipCode: customers.zipCode,
          deliveryAddress: orders.deliveryAddress,
          totalAmount: orders.totalAmount,
          paymentMethod: orders.paymentMethod,
          orderStatus: orders.status,
          deliveryMethodId: orders.deliveryMethodId,
          deliveryMethodName: deliveryMethods.name,
          notes: orders.notes,
        })
        .from(routeOrders)
        .leftJoin(orders, eq(routeOrders.orderId, orders.id))
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .where(and(eq(routeOrders.routeId, input.routeId), ne(orders.status, "cancelled")))
        .orderBy(asc(routeOrders.position));

      // Monta o detalhamento dos produtos comprados em cada pedido (produtos, minipizzas, geleias)
      const orderIds = items.map(i => i.orderId);
      const productsByOrder: Record<number, { label: string; quantity: number }[]> = {};

      if (orderIds.length > 0) {
        const itemRows = await db.select({
          id: orderItems.id, orderId: orderItems.orderId,
          productName: products.name, quantity: orderItems.quantity,
        }).from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .where(inArray(orderItems.orderId, orderIds));

        const itemIds = itemRows.map(i => i.id);
        const itemFlavorMap: Record<number, string[]> = {};
        if (itemIds.length > 0) {
          const flavorRows = await db.select({
            orderItemId: orderItemFlavors.orderItemId, flavorName: orderItemFlavors.flavorName,
          }).from(orderItemFlavors).where(inArray(orderItemFlavors.orderItemId, itemIds));
          for (const f of flavorRows) {
            (itemFlavorMap[f.orderItemId] ??= []).push(f.flavorName);
          }
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

        const jRows = await db.select({
          orderId: orderJellies.orderId, flavorName: jellyFlavors.name, quantity: orderJellies.quantity,
        }).from(orderJellies)
          .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
          .where(inArray(orderJellies.orderId, orderIds));

        for (const it of itemRows) {
          const flavors = itemFlavorMap[it.id] ?? [];
          const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
          (productsByOrder[it.orderId] ??= []).push({ label: `${it.productName}${flavorStr}`, quantity: it.quantity });
        }
        for (const mp of mpRows) {
          const flavors = mpFlavorMap[mp.id] ?? [];
          const flavorStr = flavors.length > 0 ? ` — ${flavors.join(", ")}` : "";
          (productsByOrder[mp.orderId] ??= []).push({ label: `Minipizza ${mp.typeName ?? "—"}${flavorStr}`, quantity: mp.quantity });
        }
        for (const j of jRows) {
          (productsByOrder[j.orderId] ??= []).push({ label: `Geleia ${j.flavorName}`, quantity: j.quantity });
        }
      }

      // Monta os links do Google Maps com endereços completos.
      // O link de navegação do Google Maps aceita no máximo ~9 waypoints (10 paradas
      // por link), então rotas maiores são divididas em múltiplos links ("partes"),
      // cada uma começando de onde a anterior terminou.
      const addressItems = items.filter(i => buildAddress(i).length > 0);
      const chunkSize = 10;
      const mapLinks: string[] = [];

      for (let i = 0; i < addressItems.length; i += chunkSize) {
        const chunk = addressItems.slice(i, i + chunkSize);
        const origin = i === 0
          ? (route[0].startingAddress ? encodeURIComponent(route[0].startingAddress) : encodeURIComponent(buildAddress(chunk[0])))
          : encodeURIComponent(buildAddress(addressItems[i - 1]));
        const encodedChunk = chunk.map(it => encodeURIComponent(buildAddress(it)));
        const dest = encodedChunk[encodedChunk.length - 1];
        const waypoints = encodedChunk.slice(0, -1).join("|");

        let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`;
        if (waypoints) url += `&waypoints=${waypoints}`;
        mapLinks.push(url);
      }

      // Adiciona o campo fullAddress e os produtos a cada item para facilitar exibição
      const itemsWithAddress = items.map(i => ({
        ...i,
        fullAddress: buildDisplayAddress(i),
        products: productsByOrder[i.orderId] ?? [],
      }));

      return {
        ...route[0],
        items: itemsWithAddress,
        mapLinks,
        // Mantido por compatibilidade: aponta para o primeiro link (ou único, se só houver um)
        mapsUrl: mapLinks[0] ?? "",
      };
    }),

  /** Registra entrega de um pedido na rota */
  registerDelivery: protectedProcedure
    .input(z.object({
      routeId: z.number(),
      orderId: z.number(),
      notes: z.string().optional(),
      proofImageBase64: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = requireDeliveryRole(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Confirma que o pedido pertence a uma rota deste entregador
      const [link] = await db.select({ id: routeOrders.id }).from(routeOrders)
        .leftJoin(deliveryRoutes, eq(routeOrders.routeId, deliveryRoutes.id))
        .where(and(
          eq(routeOrders.routeId, input.routeId),
          eq(routeOrders.orderId, input.orderId),
          eq(deliveryRoutes.deliveryUserId, user.id)
        )).limit(1);
      if (!link) throw new TRPCError({ code: "FORBIDDEN", message: "Este pedido não pertence a uma das suas rotas." });

      let proofImageUrl: string | undefined;
      if (input.proofImageBase64) {
        const buffer = Buffer.from(
          input.proofImageBase64.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        const { url } = await storagePut(
          `delivery-proofs/${input.orderId}-${Date.now()}.jpg`,
          buffer,
          "image/jpeg"
        );
        proofImageUrl = url;
      }

      await db.insert(deliveryRecords).values({
        orderId: input.orderId,
        deliveryUserId: user.id,
        deliveredAt: new Date(),
        notes: input.notes,
        proofImageUrl,
      });

      await db.update(orders).set({ status: "delivered" }).where(eq(orders.id, input.orderId));

      return { success: true };
    }),

  /**
   * Marca que a entrega NÃO foi realizada (ex: cliente ausente, endereço não
   * encontrado). O pedido sai da rota e volta para "Em Produção", ficando
   * disponível para ser incluído em outra rota depois. O motivo fica registrado
   * no histórico do pedido.
   */
  markUndelivered: protectedProcedure
    .input(z.object({
      routeId: z.number(),
      orderId: z.number(),
      reason: z.enum(["endereco_nao_identificado", "falta_info_complemento", "cliente_ausente", "recusou_recebimento", "outro"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = requireDeliveryRole(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Confirma que o pedido pertence a uma rota deste entregador
      const [link] = await db.select({ id: routeOrders.id }).from(routeOrders)
        .leftJoin(deliveryRoutes, eq(routeOrders.routeId, deliveryRoutes.id))
        .where(and(
          eq(routeOrders.routeId, input.routeId),
          eq(routeOrders.orderId, input.orderId),
          eq(deliveryRoutes.deliveryUserId, user.id)
        )).limit(1);
      if (!link) throw new TRPCError({ code: "FORBIDDEN", message: "Este pedido não pertence a uma das suas rotas." });

      const [current] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, input.orderId));
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });

      await db.delete(routeOrders).where(and(
        eq(routeOrders.routeId, input.routeId),
        eq(routeOrders.orderId, input.orderId)
      ));

      const reasonLabel = UNDELIVERED_REASONS[input.reason];
      const fullNote = input.notes ? `${reasonLabel} — ${input.notes}` : reasonLabel;

      if (!["delivered", "paid", "cancelled"].includes(current.status)) {
        await db.update(orders).set({ status: "production" }).where(eq(orders.id, input.orderId));
        await db.insert(orderStatusHistory).values({
          orderId: input.orderId, userId: user.id, fromStatus: current.status, toStatus: "production",
          notes: `Entrega não realizada: ${fullNote}`,
        });
      }

      // Renumera as posições restantes da rota
      const remaining = await db.select({ id: routeOrders.id, position: routeOrders.position })
        .from(routeOrders)
        .where(eq(routeOrders.routeId, input.routeId))
        .orderBy(asc(routeOrders.position));
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].position !== i + 1) {
          await db.update(routeOrders).set({ position: i + 1 }).where(eq(routeOrders.id, remaining[i].id));
        }
      }

      return { success: true };
    }),

  /** Inicia uma rota (muda status para in_progress e registra horário) */
  startRoute: protectedProcedure
    .input(z.object({ routeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const user = requireDeliveryRole(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(deliveryRoutes)
        .set({ status: "in_progress", startedAt: new Date() })
        .where(
          and(
            eq(deliveryRoutes.id, input.routeId),
            eq(deliveryRoutes.deliveryUserId, user.id)
          )
        );

      // Ao iniciar a rota, os pedidos passam de fato para "Em Rota" (saiu para entrega)
      const routeOrderRows = await db.select({ orderId: routeOrders.orderId, status: orders.status })
        .from(routeOrders)
        .leftJoin(orders, eq(routeOrders.orderId, orders.id))
        .where(eq(routeOrders.routeId, input.routeId));
      const toUpdate = routeOrderRows.filter(o => o.status === "production" || o.status === "packaged");
      if (toUpdate.length > 0) {
        await db.update(orders).set({ status: "in_route" })
          .where(inArray(orders.id, toUpdate.map(o => o.orderId)));
        await db.insert(orderStatusHistory).values(
          toUpdate.map(o => ({
            orderId: o.orderId, userId: user.id,
            fromStatus: o.status, toStatus: "in_route",
            notes: "Rota iniciada pelo entregador — saiu para entrega",
          }))
        );
      }

      return { success: true };
    }),

  /** Conclui uma rota e registra horário de conclusão */
  completeRoute: protectedProcedure
    .input(z.object({ routeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const user = requireDeliveryRole(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(deliveryRoutes)
        .set({ status: "completed", completedAt: new Date() })
        .where(
          and(
            eq(deliveryRoutes.id, input.routeId),
            eq(deliveryRoutes.deliveryUserId, user.id)
          )
        );

      return { success: true };
    }),
});
