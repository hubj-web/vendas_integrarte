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
  if (user.role !== "delivery") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a entregadores." });
  return user;
}

export const deliveryPublicRouter = router({
  /** Lista todos os entregadores ativos */
  listDeliverers: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.role, "delivery"), eq(users.active, true)))
      .orderBy(asc(users.name));
  }),

  /** Rotas atribuídas ao entregador */
  myRoutes: publicProcedure
    .input(z.object({ delivererId: z.number() }))
    .query(async ({ input }) => {
      await requireDelivery(input.delivererId);
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: deliveryRoutes.id,
        name: deliveryRoutes.name,
        deliveryDate: deliveryRoutes.deliveryDate,
        status: deliveryRoutes.status,
        createdAt: deliveryRoutes.createdAt,
      })
        .from(deliveryRoutes)
        .where(and(
          eq(deliveryRoutes.deliveryUserId, input.delivererId),
          // Show active routes (planned or in_progress)
        ))
        .orderBy(desc(deliveryRoutes.deliveryDate))
        .limit(20);
    }),

  /** Detalhes de uma rota com os pedidos */
  routeDetail: publicProcedure
    .input(z.object({ routeId: z.number(), delivererId: z.number() }))
    .query(async ({ input }) => {
      await requireDelivery(input.delivererId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const route = await db.select().from(deliveryRoutes)
        .where(and(eq(deliveryRoutes.id, input.routeId), eq(deliveryRoutes.deliveryUserId, input.delivererId)))
        .limit(1);
      if (!route[0]) throw new TRPCError({ code: "NOT_FOUND" });
      const items = await db.select({
        id: routeOrders.id,
        orderId: routeOrders.orderId,
        position: routeOrders.position,
        customerName: customers.name,
        customerPhone: customers.phone,
        deliveryAddress: orders.deliveryAddress,
        totalAmount: orders.totalAmount,
        paymentMethod: orders.paymentMethod,
        orderStatus: orders.status,
      })
        .from(routeOrders)
        .leftJoin(orders, eq(routeOrders.orderId, orders.id))
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(eq(routeOrders.routeId, input.routeId))
        .orderBy(routeOrders.position);
      // Build Google Maps URL
      const addresses = items
        .map(i => i.deliveryAddress)
        .filter(Boolean) as string[];
      let mapsUrl = "";
      if (addresses.length > 0) {
        const encoded = addresses.map(a => encodeURIComponent(a));
        if (encoded.length === 1) {
          mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded[0]}`;
        } else {
          const dest = encoded[encoded.length - 1];
          const waypoints = encoded.slice(0, -1).join("|");
          mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest}&waypoints=${waypoints}`;
        }
      }
      return { ...route[0], items, mapsUrl };
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
        const buffer = Buffer.from(input.proofImageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
        const { url } = await storagePut(`delivery-proofs/${input.orderId}-${Date.now()}.jpg`, buffer, "image/jpeg");
        proofImageUrl = url;
      }
      await db.insert(deliveryRecords).values({
        orderId: input.orderId,
        deliveryUserId: input.delivererId,
        deliveredAt: new Date(),
        notes: input.notes,
        proofImageUrl,
      });
      // Update order status
      await db.update(orders).set({ status: "delivered" }).where(eq(orders.id, input.orderId));
      // routeOrders table has no status column — order status is tracked on orders table
      return { success: true };
    }),

  /** Inicia uma rota (muda status para in_progress) */
  startRoute: publicProcedure
    .input(z.object({ routeId: z.number(), delivererId: z.number() }))
    .mutation(async ({ input }) => {
      await requireDelivery(input.delivererId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(deliveryRoutes).set({ status: "in_progress" })
        .where(and(eq(deliveryRoutes.id, input.routeId), eq(deliveryRoutes.deliveryUserId, input.delivererId)));
      return { success: true };
    }),

  /** Conclui uma rota */
  completeRoute: publicProcedure
    .input(z.object({ routeId: z.number(), delivererId: z.number() }))
    .mutation(async ({ input }) => {
      await requireDelivery(input.delivererId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(deliveryRoutes).set({ status: "completed" })
        .where(and(eq(deliveryRoutes.id, input.routeId), eq(deliveryRoutes.deliveryUserId, input.delivererId)));
      return { success: true };
    }),
});
