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

// Coordenadas aproximadas dos bairros de Uberlândia para fallback
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

// ─── FUNÇÕES AUXILIARES ─────────────────────────────────────────────────────

/**
 * Algoritmo de agrupamento por proximidade geográfica (fallback local)
 * Agrupa os shipments em N rotas baseadas em distância euclidiana da origem
 */
function clusterOrdersByProximity(
  ordersToProcess: OrderWithLocation[],
  originCoords: { latitude: number; longitude: number },
  numRoutes: number
): number[][] {
  // Calcular distância de cada pedido à origem
  const ordersWithDistance = ordersToProcess.map((o) => ({
    index: ordersToProcess.indexOf(o),
    dist: Math.sqrt(
      Math.pow(o.latitude! - originCoords.latitude, 2) +
      Math.pow(o.longitude! - originCoords.longitude, 2)
    ),
  }));

  // Ordenar por distância
  ordersWithDistance.sort((a, b) => a.dist - b.dist);

  // Distribuir em rotas usando round-robin a partir do mais distante
  // Isso ajuda a balancear as rotas por distância total
  const clusters: number[][] = Array.from({ length: numRoutes }, () => []);

  // Distribuir em ordem decrescente de distância para melhor balanceamento
  const sorted = [...ordersWithDistance].sort((a, b) => b.dist - a.dist);

  for (let i = 0; i < sorted.length; i++) {
    // Adicionar ao cluster com menor soma de distâncias
    let bestCluster = 0;
    let bestDist = Infinity;
    for (let c = 0; c < numRoutes; c++) {
      const orderIdx = sorted[i].index;
      const order = ordersToProcess[orderIdx];
      // Calcular a distância média do cluster atual
      const clusterDist = clusters[c].reduce((sum, idx) => {
        const prev = ordersToProcess[idx];
        return sum + Math.sqrt(
          Math.pow(prev.latitude! - order.latitude!, 2) +
          Math.pow(prev.longitude! - order.longitude!, 2)
        );
      }, 0);
      if (clusterDist < bestDist) {
        bestDist = clusterDist;
        bestCluster = c;
      }
    }
    clusters[bestCluster].push(sorted[i].index);
  }

  return clusters;
}

/**
 * Ordena os pedidos dentro de uma rota usando o algoritmo do vizinho mais próximo
 */
function orderStopsByNearestNeighbor(
  ordersInRoute: number[],
  ordersToProcess: OrderWithLocation[],
  originCoords: { latitude: number; longitude: number }
): number[] {
  if (ordersInRoute.length <= 1) return ordersInRoute;

  const remaining = [...ordersInRoute];
  const ordered: number[] = [];
  let current = originCoords;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const order = ordersToProcess[remaining[i]];
      const dist = Math.sqrt(
        Math.pow(order.latitude! - current.latitude, 2) +
        Math.pow(order.longitude! - current.longitude, 2)
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const chosen = remaining.splice(nearestIdx, 1)[0];
    ordered.push(chosen);
    current = {
      latitude: ordersToProcess[chosen].latitude!,
      longitude: ordersToProcess[chosen].longitude!,
    };
  }

  return ordered;
}

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
      console.log(`[Roteirização] Coordenadas da origem: ${originCoords.latitude}, ${originCoords.longitude}`);

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
          console.warn(`[Roteirização] Geocodificação falhou para pedido #${o.id}. Usando coordenadas aproximadas.`);
        }

        // Salvar coordenadas no objeto para uso posterior
        o.latitude = coords.latitude;
        o.longitude = coords.longitude;

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

      // 3. Tenta otimização via Google Maps API
      let optimizationResult: any = null;
      let useGoogleApi = false;

      if (googleMapsClient.isConfigured()) {
        try {
          console.log(`[Roteirização] Chamando Google Maps Route Optimization API para ${shipments.length} shipments e ${vehicles.length} vehicles...`);
          optimizationResult = await googleMapsClient.optimizeRoutes(shipments, vehicles, {
            trafficAware: true,
          });
          if (optimizationResult && optimizationResult.routes && optimizationResult.routes.length > 0) {
            useGoogleApi = true;
            console.log(`[Roteirização] Google Maps retornou ${optimizationResult.routes.length} rotas otimizadas.`);
          } else if (optimizationResult && optimizationResult.routes && optimizationResult.routes.length === 0) {
            console.warn("[Roteirização] Google Maps retornou 0 rotas. Usando fallback local.");
          }
        } catch (error: any) {
          console.error(`[Roteirização] Google Maps API falhou: ${error.message || error}. Usando fallback local.`);
        }
      } else {
        console.warn("[Roteirização] Google Maps API não configurada. Usando fallback local.");
      }

      // 4. Se a API do Google falhou ou não foi usada, aplica fallback local
      let routeClusters: number[][];
      let routeMetrics: { totalDistanceMeters: number; visits: any[] }[];

      if (useGoogleApi && optimizationResult?.routes) {
        // Usar rotas do Google Maps
        routeClusters = optimizationResult.routes.map((route: any) =>
          route.visits.map((visit: any) => visit.shipmentIndex)
        );
        routeMetrics = optimizationResult.routes.map((route: any) => ({
          totalDistanceMeters: route.metrics?.travelDistanceMeters || route.distanceMeters || 0,
          visits: route.visits || [],
        }));
      } else {
        // Fallback: agrupamento por proximidade geográfica
        console.log(`[Roteirização] Usando algoritmo local de agrupamento por proximidade para ${numRoutes} rotas.`);
        routeClusters = clusterOrdersByProximity(ordersToProcess, originCoords, numRoutes);

        // Ordenar paradas dentro de cada rota usando vizinho mais próximo
        routeClusters = routeClusters.map((cluster) =>
          orderStopsByNearestNeighbor(cluster, ordersToProcess, originCoords)
        );

        // Calcular métricas aproximadas (distância euclidiana)
        routeMetrics = routeClusters.map((cluster) => {
          let totalDist = 0;
          const visits = cluster.map((orderIdx, i) => {
            const order = ordersToProcess[orderIdx];
            let distFromPrev = 0;
            if (i > 0) {
              const prev = ordersToProcess[cluster[i - 1]];
              distFromPrev = Math.sqrt(
                Math.pow(order.latitude! - prev.latitude!, 2) +
                Math.pow(order.longitude! - prev.longitude!, 2)
              ) * 111000; // Converter graus para metros (aproximado)
            } else {
              distFromPrev = Math.sqrt(
                Math.pow(order.latitude! - originCoords.latitude, 2) +
                Math.pow(order.longitude! - originCoords.longitude, 2)
              ) * 111000;
            }
            totalDist += distFromPrev;
            return {
              shipmentIndex: orderIdx,
              distanceMeters: Math.round(distFromPrev),
            };
          });
          return {
            totalDistanceMeters: Math.round(totalDist),
            visits,
          };
        });

        console.log(`[Roteirização] Fallback local gerou ${routeClusters.length} rotas.`);
      }

      // 5. Salva as rotas no banco
      const createdRouteIds: number[] = [];
      const now = new Date();

      for (let i = 0; i < routeClusters.length; i++) {
        const cluster = routeClusters[i];
        if (cluster.length === 0) continue;

        const ordersInRoute = cluster.map((idx) => ordersToProcess[idx]);
        const metrics = routeMetrics[i];
        const totalDistance = metrics.totalDistanceMeters / 1000;

        const [newRoute] = await db.insert(deliveryRoutes).values({
          name: vehicles[i]?.displayName || `${input.routeNamePrefix} #${i + 1}`,
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
          const visit = metrics.visits[j];
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
        message: `${createdRouteIds.length} rota(s) criada(s) com sucesso!${useGoogleApi ? " (otimizadas pelo Google Maps)" : " (agrupadas por proximidade)"}`,
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
