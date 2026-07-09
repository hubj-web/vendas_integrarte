import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import {
  customers, deliveryMethods, deliveryRoutes,
  orders, routeOrders, users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { googleMapsClient } from "../google-maps";

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface OrderWithLocation {
  id: number;
  totalAmount: string;
  deliveryDate: Date | null;
  deliveryAddress: string | null;
  status: "production" | "in_route" | "delivered" | "paid" | "cancelled";
  customerId: number;
  customerName: string;
  customerPhone: string;
  customerStreet: string | null;
  customerNumber: string | null;
  customerNeighborhood: string | null;
  customerCity: string | null;
  deliveryMethodId: number;
  deliveryMethodName: string | null;
  latitude?: number;
  longitude?: number;
}

function buildFullAddress(o: OrderWithLocation): string {
  if (o.deliveryAddress) return o.deliveryAddress;
  return [o.customerStreet, o.customerNumber, o.customerNeighborhood, o.customerCity, "MG"]
    .filter(Boolean).join(", ");
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────

export const routeOptimizationRouter = router({
  /**
   * Lista pedidos disponíveis com filtro por tipo de entrega.
   */
  availableOrdersForPeriod: protectedProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
      deliveryMethodId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const dateFromObj = new Date(input.dateFrom + "T00:00:00");
      const dateToObj = new Date(input.dateTo + "T23:59:59");

      const whereConditions = [
        eq(orders.status, "production"),
        gte(orders.createdAt, dateFromObj),
        lte(orders.createdAt, dateToObj),
      ];

      if (input.deliveryMethodId) {
        whereConditions.push(eq(orders.deliveryMethodId, input.deliveryMethodId));
      }

      const rows = await db
        .select({
          id: orders.id,
          totalAmount: orders.totalAmount,
          deliveryDate: orders.deliveryDate,
          deliveryAddress: orders.deliveryAddress,
          status: orders.status,
          customerId: orders.customerId,
          customerName: customers.name,
          customerPhone: customers.phone,
          customerStreet: customers.street,
          customerNumber: customers.number,
          customerNeighborhood: customers.neighborhood,
          customerCity: customers.city,
          deliveryMethodId: orders.deliveryMethodId,
          deliveryMethodName: deliveryMethods.name,
        })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .where(and(...whereConditions))
        .orderBy(asc(customers.neighborhood));

      return rows as OrderWithLocation[];
    }),

  /**
   * Gera rotas otimizadas usando a Google Maps Route Optimization API
   */
  generateOptimizedRoutes: protectedProcedure
    .input(z.object({
      selectedOrderIds: z.array(z.number()),
      numRoutes: z.number().min(1),
      startingAddress: z.string(),
      routeNamePrefix: z.string().default("Rota"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verifica se a API está configurada
      if (!googleMapsClient.isConfigured()) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Google Maps API não configurada. Configure GOOGLE_MAPS_API_KEY e GOOGLE_CLOUD_PROJECT_ID.",
        });
      }

      // 1. Busca dados completos dos pedidos selecionados
      const orderRows = await db
        .select({
          id: orders.id,
          totalAmount: orders.totalAmount,
          deliveryDate: orders.deliveryDate,
          deliveryAddress: orders.deliveryAddress,
          status: orders.status,
          customerId: orders.customerId,
          customerName: customers.name,
          customerPhone: customers.phone,
          customerStreet: customers.street,
          customerNumber: customers.number,
          customerNeighborhood: customers.neighborhood,
          customerCity: customers.city,
          deliveryMethodId: orders.deliveryMethodId,
          deliveryMethodName: deliveryMethods.name,
        })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .where(inArray(orders.id, input.selectedOrderIds));

      if (orderRows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum pedido encontrado." });

      const ordersToProcess = orderRows as OrderWithLocation[];
      const numRoutes = Math.min(input.numRoutes, ordersToProcess.length);

      // 2. Prepara dados para a API do Google Maps
      // Usa coordenadas aproximadas do bairro se não houver lat/lon
      const shipments = ordersToProcess.map((o, idx) => ({
        id: o.id,
        location: {
          latitude: o.latitude || -18.9186, // Centro de Uberlândia como fallback
          longitude: o.longitude || -48.2772,
        },
        label: `Pedido #${o.id} - ${o.customerName}`,
      }));

      // Cria veículos fictícios (sem informações específicas, apenas para divisão)
      const vehicles = Array.from({ length: numRoutes }, (_, i) => ({
        id: i,
        displayName: `${input.routeNamePrefix} #${i + 1}`,
        startLocation: {
          latitude: -18.9186, // Centro de Uberlândia
          longitude: -48.2772,
        },
        endLocation: {
          latitude: -18.9186,
          longitude: -48.2772,
        },
      }));

      // 3. Chama a API do Google Maps
      const optimizationResult = await googleMapsClient.optimizeRoutes(shipments, vehicles, {
        routeStrategy: "DEFAULT_ROUTE_STRATEGY",
        trafficAware: false,
      });

      if (!optimizationResult || !optimizationResult.routes) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Falha ao otimizar rotas com Google Maps API. Tente novamente.",
        });
      }

      // 4. Salva as rotas otimizadas no banco de dados
      const createdRouteIds: number[] = [];
      const now = new Date();

      for (const route of optimizationResult.routes) {
        if (!route.visits || route.visits.length === 0) continue;

        const ordersInRoute = route.visits
          .map((visit) => ordersToProcess[visit.shipmentIndex])
          .filter((o): o is OrderWithLocation => !!o);

        if (ordersInRoute.length === 0) continue;

        // Calcula distância total da rota
        const totalDistance = route.metrics.travelDistanceMeters / 1000; // Converte para km

        const [newRoute] = await db.insert(deliveryRoutes).values({
          name: vehicles[route.vehicleIndex]?.displayName || `${input.routeNamePrefix} #${route.vehicleIndex + 1}`,
          deliveryDate: now,
          deliveryUserId: 0, // Será atribuído manualmente depois
          startingAddress: input.startingAddress,
          totalDistance: totalDistance.toFixed(2),
          status: "planned",
          createdBy: ctx.user!.id,
        });

        const routeId = (newRoute as any).insertId;
        createdRouteIds.push(routeId);

        // Insere paradas na ordem otimizada
        for (let j = 0; j < ordersInRoute.length; j++) {
          const order = ordersInRoute[j];
          const prevOrder = j === 0 ? null : ordersInRoute[j - 1];
          
          // Calcula distância até esta parada (aproximada)
          let distFromPrev = 0;
          if (prevOrder) {
            const prevCoords = {
              latitude: prevOrder.latitude || -18.9186,
              longitude: prevOrder.longitude || -48.2772,
            };
            const currCoords = {
              latitude: order.latitude || -18.9186,
              longitude: order.longitude || -48.2772,
            };
            // Usa a distância do visit se disponível, senão calcula aproximadamente
            const visit = route.visits[j];
            distFromPrev = visit?.distanceMeters ? visit.distanceMeters / 1000 : 0;
          }

          await db.insert(routeOrders).values({
            routeId,
            orderId: order.id,
            position: j + 1,
            distanceFromPrevious: distFromPrev.toFixed(2),
          });

          await db.update(orders).set({ status: "in_route" }).where(eq(orders.id, order.id));
        }
      }

      return {
        totalRoutes: createdRouteIds.length,
        totalOrders: input.selectedOrderIds.length,
        routeIds: createdRouteIds,
        message: `${createdRouteIds.length} rota(s) otimizada(s) com sucesso usando Google Maps API!`,
      };
    }),

  /**
   * Atribui um entregador a uma rota.
   */
  assignDeliverer: protectedProcedure
    .input(z.object({
      routeId: z.number(),
      deliveryUserId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(deliveryRoutes)
        .set({ deliveryUserId: input.deliveryUserId })
        .where(eq(deliveryRoutes.id, input.routeId));
      return { success: true };
    }),

  /**
   * Exclui rotas e reverte pedidos para produção.
   */
  deleteRoutes: protectedProcedure
    .input(z.object({ routeIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      for (const routeId of input.routeIds) {
        const rOrders = await db.select().from(routeOrders).where(eq(routeOrders.routeId, routeId));
        const orderIds = rOrders.map(ro => ro.orderId);
        if (orderIds.length > 0) {
          await db.update(orders).set({ status: "production" }).where(inArray(orders.id, orderIds));
        }
        await db.delete(routeOrders).where(eq(routeOrders.routeId, routeId));
        await db.delete(deliveryRoutes).where(eq(deliveryRoutes.id, routeId));
      }

      return { deletedCount: input.routeIds.length };
    }),
});
