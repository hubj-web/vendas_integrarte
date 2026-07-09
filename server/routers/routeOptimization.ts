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
  if (o.deliveryAddress && o.deliveryAddress.length > 10) return o.deliveryAddress;
  const parts = [o.customerStreet, o.customerNumber, o.customerNeighborhood, o.customerCity, "MG"];
  return parts.filter(Boolean).join(", ");
}

// Coordenadas aproximadas dos bairros de Uberlândia para fallback imediato
const NEIGHBORHOOD_COORDS: Record<string, { lat: number; lng: number }> = {
  "centro": { lat: -18.9186, lng: -48.2772 },
  "fundinho": { lat: -18.9220, lng: -48.2790 },
  "santa monica": { lat: -18.9190, lng: -48.2580 },
  "jardim finotti": { lat: -18.9250, lng: -48.2620 },
  "segismundo pereira": { lat: -18.9320, lng: -48.2450 },
  "tibery": { lat: -18.9050, lng: -48.2550 },
  "brasil": { lat: -18.9050, lng: -48.2750 },
  "aparecida": { lat: -18.9100, lng: -48.2650 },
  "martins": { lat: -18.9150, lng: -48.2850 },
  "osvaldo rezende": { lat: -18.9200, lng: -48.2900 },
  "bom jesus": { lat: -18.9100, lng: -48.2950 },
  "patrimonio": { lat: -18.9400, lng: -48.2850 },
  "copacabana": { lat: -18.9500, lng: -48.2900 },
  "sao jorge": { lat: -18.9650, lng: -48.2750 },
  "laranjal": { lat: -18.9600, lng: -48.2600 },
  "dom almir": { lat: -18.9350, lng: -48.2100 },
  "joana darc": { lat: -18.9400, lng: -48.2000 },
  "mansour": { lat: -18.9150, lng: -48.3300 },
  "luizote de freitas": { lat: -18.9050, lng: -48.3250 },
  "jardim patricia": { lat: -18.9250, lng: -48.3200 },
  "dona zulmira": { lat: -18.8950, lng: -48.3150 },
  "taiaman": { lat: -18.8850, lng: -48.3300 },
  "guarani": { lat: -18.8800, lng: -48.3000 },
  "uuarani": { lat: -18.8800, lng: -48.3000 },
  "tocantins": { lat: -18.8700, lng: -48.3150 },
  "canaan": { lat: -18.8750, lng: -48.3300 },
  "industrial": { lat: -18.8600, lng: -48.2800 },
  "distrito industrial": { lat: -18.8500, lng: -48.2700 },
  "aclimacao": { lat: -18.8900, lng: -48.2300 },
  "custodio pereira": { lat: -18.8950, lng: -48.2500 },
  "uuarujá": { lat: -18.8850, lng: -48.2400 },
  "altamira": { lat: -18.9450, lng: -48.2650 },
  "gávea": { lat: -18.9550, lng: -48.2600 },
  "shopping park": { lat: -18.9800, lng: -48.2800 },
};

// ─── ROUTER ──────────────────────────────────────────────────────────────────

export const routeOptimizationRouter = router({
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

      if (!googleMapsClient.isConfigured()) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Google Maps API não configurada no servidor.",
        });
      }

      // 1. Busca dados dos pedidos
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
      
      // 2. Geocodificação dos pedidos e da origem
      console.log(`[Roteirização] Iniciando geocodificação de ${ordersToProcess.length} pedidos...`);
      
      const originCoords = await googleMapsClient.geocode(input.startingAddress) || { latitude: -18.9186, longitude: -48.2772 };

      const shipments = await Promise.all(ordersToProcess.map(async (o) => {
        const fullAddress = buildFullAddress(o);
        let coords = await googleMapsClient.geocode(fullAddress);
        
        // Fallback para bairro se a geocodificação falhar
        if (!coords && o.customerNeighborhood) {
          const neighborhood = o.customerNeighborhood.toLowerCase().trim();
          const fallback = NEIGHBORHOOD_COORDS[neighborhood];
          if (fallback) {
            coords = { latitude: fallback.lat, longitude: fallback.lng };
          }
        }
        
        // Fallback final (centro) com um pequeno offset para não ficarem no mesmo ponto exato
        if (!coords) {
          coords = { 
            latitude: -18.9186 + (Math.random() - 0.5) * 0.01, 
            longitude: -48.2772 + (Math.random() - 0.5) * 0.01 
          };
        }

        return {
          id: o.id,
          location: coords,
          label: `Pedido #${o.id} - ${o.customerName}`,
        };
      }));

      const numRoutes = Math.min(input.numRoutes, ordersToProcess.length);
      const vehicles = Array.from({ length: numRoutes }, (_, i) => ({
        id: i,
        displayName: `${input.routeNamePrefix} #${i + 1}`,
        startLocation: originCoords,
        endLocation: originCoords,
      }));

      // 3. Chama a API do Google Maps
      let optimizationResult;
      try {
        optimizationResult = await googleMapsClient.optimizeRoutes(shipments, vehicles, {
          routeStrategy: "DEFAULT_ROUTE_STRATEGY",
          trafficAware: true,
        });
      } catch (error: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message || "Erro na comunicação com Google Maps.",
        });
      }

      if (!optimizationResult || !optimizationResult.routes) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "O Google Maps não conseguiu gerar rotas válidas para estes endereços.",
        });
      }

      // 4. Salva as rotas
      const createdRouteIds: number[] = [];
      const now = new Date();

      for (const route of optimizationResult.routes) {
        if (!route.visits || route.visits.length === 0) continue;

        const ordersInRoute = route.visits
          .map((visit) => ordersToProcess[visit.shipmentIndex])
          .filter((o): o is OrderWithLocation => !!o);

        if (ordersInRoute.length === 0) continue;

        const totalDistance = route.metrics.travelDistanceMeters / 1000;

        const [newRoute] = await db.insert(deliveryRoutes).values({
          name: vehicles[route.vehicleIndex]?.displayName || `${input.routeNamePrefix} #${route.vehicleIndex + 1}`,
          deliveryDate: now,
          deliveryUserId: 0,
          startingAddress: input.startingAddress,
          totalDistance: totalDistance.toFixed(2),
          status: "planned",
          createdBy: ctx.user!.id,
        });

        const routeId = (newRoute as any).insertId;
        createdRouteIds.push(routeId);

        for (let j = 0; j < ordersInRoute.length; j++) {
          const order = ordersInRoute[j];
          const visit = route.visits[j];
          const distFromPrev = visit?.distanceMeters ? visit.distanceMeters / 1000 : 0;

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
        message: `${createdRouteIds.length} rota(s) otimizada(s) com Google Maps!`,
      };
    }),

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
