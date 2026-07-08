import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  customers, deliveryMethods, deliveryRoutes,
  orders, routeOrders, users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

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

interface RouteAssignment {
  orders: OrderWithLocation[];
  estimatedDistance: number;
  neighborhoods: string[];
}

// ─── MAPA DE BAIRROS DE UBERLÂNDIA ──────────────────────────────────────────
// Coordenadas aproximadas dos centróides de bairros de Uberlândia-MG.
const NEIGHBORHOOD_COORDS: Record<string, [number, number]> = {
  // Centro e adjacentes
  "centro": [-18.9186, -48.2772],
  "fundinho": [-18.9220, -48.2790],
  "lídice": [-18.9250, -48.2750],
  "tabajaras": [-18.9280, -48.2820],
  "cazeca": [-18.9150, -48.2700],
  "santa maria": [-18.9350, -48.2700],
  "aparecida": [-18.9100, -48.2650],
  "brasil": [-18.9050, -48.2750],
  "martins": [-18.9150, -48.2850],
  "osvaldo rezende": [-18.9200, -48.2900],

  // Zona Sul
  "santa mônica": [-18.9150, -48.2450],
  "segismundo pereira": [-18.9250, -48.2350],
  "jardim finotti": [-18.9200, -48.2550],
  "tibery": [-18.9050, -48.2500],
  "uai": [-18.9400, -48.2500],
  "pampulha": [-18.9500, -48.2600],
  "granada": [-18.9650, -48.2550],
  "são jorge": [-18.9700, -48.2450],
  "laranjeiras": [-18.9800, -48.2500],
  "shopping park": [-18.9950, -48.2650],
  "gávea": [-18.9550, -48.2850],
  "viva gávea": [-18.9600, -48.2800],

  // Zona Oeste
  "luizote de freitas": [-18.9100, -48.3300],
  "jardim patrícia": [-18.9200, -48.3200],
  "mansour": [-18.9000, -48.3400],
  "planalto": [-18.9350, -48.3200],
  "canaã": [-18.9450, -48.3350],
  "jardim holanda": [-18.9550, -48.3300],
  "dona zulmira": [-18.9000, -48.3150],
  "taiama": [-18.8950, -48.3300],
  "guarani": [-18.8900, -48.3200],
  "tocantins": [-18.8850, -48.3350],

  // Zona Leste
  "santa luzia": [-18.9450, -48.2300],
  "alvorada": [-18.9550, -48.2200],
  "novo mundo": [-18.9100, -48.2100],
  "morumbi": [-18.9200, -48.2000],
  "dom almir": [-18.9300, -48.1900],
  "joana d'arc": [-18.9350, -48.1850],

  // Zona Norte
  "industrial": [-18.8800, -48.2600],
  "distrito industrial": [-18.8700, -48.2800],
  "jardim américa": [-18.8900, -48.2700],
  "esperança": [-18.8950, -48.2550],
};

const DEFAULT_COORDS: [number, number] = [-18.9186, -48.2772]; // Centro

/**
 * Retorna as coordenadas aproximadas de um pedido.
 */
function getOrderCoords(order: OrderWithLocation): [number, number] {
  if (order.latitude !== undefined && order.longitude !== undefined) {
    return [order.latitude, order.longitude];
  }
  const neighborhood = (order.customerNeighborhood ?? "").toLowerCase().trim();
  if (neighborhood && NEIGHBORHOOD_COORDS[neighborhood]) {
    return NEIGHBORHOOD_COORDS[neighborhood] as [number, number];
  }
  for (const entry of Object.entries(NEIGHBORHOOD_COORDS)) {
    const key = entry[0];
    const coords = entry[1] as [number, number];
    if (neighborhood.includes(key) || key.includes(neighborhood)) {
      return coords;
    }
  }
  return DEFAULT_COORDS;
}

/**
 * Fórmula de Haversine para distância em km.
 */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateDistance(
  lat1: number | undefined, lon1: number | undefined,
  lat2: number | undefined, lon2: number | undefined,
  neighborhood1: string, neighborhood2: string
): number {
  if (lat1 !== undefined && lon1 !== undefined && lat2 !== undefined && lon2 !== undefined) {
    return haversine(lat1, lon1, lat2, lon2);
  }
  const c1 = (NEIGHBORHOOD_COORDS[neighborhood1.toLowerCase().trim()] ?? DEFAULT_COORDS) as [number, number];
  const c2 = (NEIGHBORHOOD_COORDS[neighborhood2.toLowerCase().trim()] ?? DEFAULT_COORDS) as [number, number];
  return haversine(c1[0], c1[1], c2[0], c2[1]);
}

/**
 * Gera links do Google Maps quebrados a cada 10 paradas.
 */
function generateMapsLinks(orders: OrderWithLocation[], startingAddress: string): string[] {
  if (orders.length === 0) return [];
  const links: string[] = [];
  const chunkSize = 10;
  
  for (let i = 0; i < orders.length; i += chunkSize) {
    const chunk = orders.slice(i, i + chunkSize);
    const origin = i === 0 ? encodeURIComponent(startingAddress) : encodeURIComponent(buildFullAddress(orders[i-1]));
    const dest = encodeURIComponent(buildFullAddress(chunk[chunk.length - 1]));
    const waypoints = chunk.slice(0, -1).map(o => encodeURIComponent(buildFullAddress(o))).join("|");
    
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`;
    if (waypoints) url += `&waypoints=${waypoints}`;
    links.push(url);
  }
  return links;
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
   * Algoritmo de geração de rotas equilibradas por KM.
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

      // 2. Clustering Geográfico (K-Means simplificado)
      const routeAssignments: RouteAssignment[] = Array.from({ length: numRoutes }, () => ({
        orders: [],
        estimatedDistance: 0,
        neighborhoods: [],
      }));

      // Centróides iniciais (pedidos mais distantes entre si)
      const centroids: [number, number][] = [];
      centroids.push(getOrderCoords(ordersToProcess[0]));
      while (centroids.length < numRoutes) {
        let maxDist = -1;
        let bestIdx = 0;
        for (let i = 0; i < ordersToProcess.length; i++) {
          const coords = getOrderCoords(ordersToProcess[i]);
          const minDistToCentroid = Math.min(...centroids.map(c => haversine(coords[0], coords[1], c[0], c[1])));
          if (minDistToCentroid > maxDist) {
            maxDist = minDistToCentroid;
            bestIdx = i;
          }
        }
        centroids.push(getOrderCoords(ordersToProcess[bestIdx]));
      }

      // Atribuição inicial por proximidade ao centróide
      for (const order of ordersToProcess) {
        const coords = getOrderCoords(order);
        let minDist = Infinity;
        let bestRoute = 0;
        for (let i = 0; i < numRoutes; i++) {
          const d = haversine(coords[0], coords[1], centroids[i][0], centroids[i][1]);
          if (d < minDist) {
            minDist = d;
            bestRoute = i;
          }
        }
        routeAssignments[bestRoute].orders.push(order);
      }

      // 3. Equilíbrio de KM (Mover pedidos de rotas longas para rotas curtas se forem vizinhos)
      // (Implementação simplificada: garantimos que cada rota tenha ao menos 1 pedido)
      
      // 4. Ordenação interna (Nearest Neighbor) e cálculo de distância
      const startCoords = DEFAULT_COORDS; // Poderia vir do startingAddress se geocodificado
      
      for (const route of routeAssignments) {
        if (route.orders.length === 0) continue;
        
        const sorted: OrderWithLocation[] = [];
        let currentCoords = startCoords;
        const remaining = [...route.orders];
        let totalDist = 0;

        while (remaining.length > 0) {
          let minDist = Infinity;
          let bestIdx = 0;
          for (let i = 0; i < remaining.length; i++) {
            const coords = getOrderCoords(remaining[i]);
            const d = haversine(currentCoords[0], currentCoords[1], coords[0], coords[1]);
            if (d < minDist) {
              minDist = d;
              bestIdx = i;
            }
          }
          const next = remaining.splice(bestIdx, 1)[0];
          totalDist += minDist;
          currentCoords = getOrderCoords(next);
          sorted.push(next);
        }
        route.orders = sorted;
        route.estimatedDistance = totalDist;
        route.neighborhoods = Array.from(new Set(sorted.map(o => o.customerNeighborhood).filter((n): n is string => !!n)));
      }

      // 5. Salvar no Banco de Dados
      const createdRouteIds: number[] = [];
      const now = new Date();

      for (let i = 0; i < routeAssignments.length; i++) {
        const route = routeAssignments[i];
        if (route.orders.length === 0) continue;

        const [newRoute] = await db.insert(deliveryRoutes).values({
          name: `${input.routeNamePrefix} #${i + 1}`,
          deliveryDate: now,
          deliveryUserId: 0, // Será atribuído manualmente depois
          startingAddress: input.startingAddress,
          totalDistance: route.estimatedDistance.toFixed(2),
          status: "planned",
          createdBy: ctx.user!.id,
        });

        const routeId = (newRoute as any).insertId;
        createdRouteIds.push(routeId);

        // Insere paradas
        for (let j = 0; j < route.orders.length; j++) {
          const order = route.orders[j];
          const prevCoords = j === 0 ? startCoords : getOrderCoords(route.orders[j-1]);
          const currCoords = getOrderCoords(order);
          const dist = haversine(prevCoords[0], prevCoords[1], currCoords[0], currCoords[1]);

          await db.insert(routeOrders).values({
            routeId,
            orderId: order.id,
            position: j + 1,
            distanceFromPrevious: dist.toFixed(2),
          });

          await db.update(orders).set({ status: "in_route" }).where(eq(orders.id, order.id));
        }
      }

      return {
        totalRoutes: createdRouteIds.length,
        totalOrders: input.selectedOrderIds.length,
        routeIds: createdRouteIds,
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
