/**
 * Router público para a Área do Entregador.
 * Não requer autenticação — o entregador é identificado pelo userId passado.
 * Operações de escrita exigem que o userId seja de um usuário com role=delivery.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  customers, deliveryRecords, routeOrders, deliveryRoutes,
  orders, users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

// Helper: validate that userId belongs to a delivery person
async function requireDelivery(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const result = await db.select().from(users)
    .where(and(eq(users.id, userId), eq(users.active, true)))
    .limit(1);
  const user = result[0];
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Entregador não encontrado." });
  const hasDeliveryRole = user.role === "delivery" || (user.roles && user.roles.includes('"delivery"'));
  if (!hasDeliveryRole && user.role !== "admin") {
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

export const deliveryPublicRouter = router({
  /** Lista todos os entregadores ativos */
  listDeliverers: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const allActive = await db
      .select({ id: users.id, name: users.name, role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.active, true))
      .orderBy(asc(users.name));
    return allActive
      .filter(u => u.role === "delivery" || (u.roles && u.roles.includes('"delivery"')))
      .map(u => ({ id: u.id, name: u.name }));
  }),

  /**
   * Rotas atribuídas ao entregador.
   * Mostra rotas planejadas, em andamento e as últimas concluídas (até 5).
   */
  myRoutes: publicProcedure
    .input(z.object({ delivererId: z.number() }))
    .query(async ({ input }) => {
      await requireDelivery(input.delivererId);
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
        .where(eq(deliveryRoutes.deliveryUserId, input.delivererId))
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
  routeDetail: publicProcedure
    .input(z.object({ routeId: z.number(), delivererId: z.number() }))
    .query(async ({ input }) => {
      await requireDelivery(input.delivererId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const route = await db
        .select()
        .from(deliveryRoutes)
        .where(
          and(
            eq(deliveryRoutes.id, input.routeId),
            eq(deliveryRoutes.deliveryUserId, input.delivererId)
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
          customerNeighborhood: customers.neighborhood,
          customerCity: customers.city,
          customerZipCode: customers.zipCode,
          deliveryAddress: orders.deliveryAddress,
          totalAmount: orders.totalAmount,
          paymentMethod: orders.paymentMethod,
          orderStatus: orders.status,
        })
        .from(routeOrders)
        .leftJoin(orders, eq(routeOrders.orderId, orders.id))
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(eq(routeOrders.routeId, input.routeId))
        .orderBy(asc(routeOrders.position));

      // Monta URL do Google Maps com endereços completos
      const addresses = items
        .map(i => buildAddress(i))
        .filter(a => a.length > 0);

      let mapsUrl = "";
      if (addresses.length > 0) {
        // Usa o endereço de saída da rota como origem, se disponível
        const origin = route[0].startingAddress
          ? encodeURIComponent(route[0].startingAddress)
          : encodeURIComponent(addresses[0]);

        const encoded = addresses.map(a => encodeURIComponent(a));

        if (encoded.length === 1) {
          mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${encoded[0]}`;
        } else {
          const dest = encoded[encoded.length - 1];
          const waypoints = encoded.slice(0, -1).join("|");
          mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&waypoints=${waypoints}`;
        }
      }

      // Adiciona o campo fullAddress a cada item para facilitar exibição
      const itemsWithAddress = items.map(i => ({
        ...i,
        fullAddress: buildAddress(i),
      }));

      return {
        ...route[0],
        items: itemsWithAddress,
        mapsUrl,
      };
    }),

  /** Registra entrega de um pedido na rota */
  registerDelivery: publicProcedure
    .input(z.object({
      routeId: z.number(),
      orderId: z.number(),
      delivererId: z.number(),
      notes: z.string().optional(),
      proofImageBase64: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await requireDelivery(input.delivererId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

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
        deliveryUserId: input.delivererId,
        deliveredAt: new Date(),
        notes: input.notes,
        proofImageUrl,
      });

      await db.update(orders).set({ status: "delivered" }).where(eq(orders.id, input.orderId));

      return { success: true };
    }),

  /** Inicia uma rota (muda status para in_progress e registra horário) */
  startRoute: publicProcedure
    .input(z.object({ routeId: z.number(), delivererId: z.number() }))
    .mutation(async ({ input }) => {
      await requireDelivery(input.delivererId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(deliveryRoutes)
        .set({ status: "in_progress", startedAt: new Date() })
        .where(
          and(
            eq(deliveryRoutes.id, input.routeId),
            eq(deliveryRoutes.deliveryUserId, input.delivererId)
          )
        );

      return { success: true };
    }),

  /** Conclui uma rota e registra horário de conclusão */
  completeRoute: publicProcedure
    .input(z.object({ routeId: z.number(), delivererId: z.number() }))
    .mutation(async ({ input }) => {
      await requireDelivery(input.delivererId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(deliveryRoutes)
        .set({ status: "completed", completedAt: new Date() })
        .where(
          and(
            eq(deliveryRoutes.id, input.routeId),
            eq(deliveryRoutes.deliveryUserId, input.delivererId)
          )
        );

      return { success: true };
    }),
});
