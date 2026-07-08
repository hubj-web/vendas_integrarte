import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc, inArray, gte, lte } from "drizzle-orm";
import { z } from "zod";
import {
  deliveryRoutes, routeOrders, orders, customers, users, deliveryMethods,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

/**
 * ─── ROTEIRIZAÇÃO INTELIGENTE LOCAL ─────────────────────────────────────────
 *
 * Algoritmo em 3 etapas:
 * 1. Geocodificação estimada: converte bairro/cidade em coordenadas aproximadas
 *    usando um mapa de bairros conhecidos de Uberlândia-MG.
 * 2. Clustering geográfico (K-Means adaptado): agrupa pedidos próximos para
 *    que cada rota cubra uma região geográfica coerente.
 * 3. Equilíbrio de KM: ajusta os clusters para que a distância estimada de
 *    cada rota seja similar, redistribuindo pedidos de clusters mais pesados
 *    para os mais leves.
 * 4. Ordenação TSP guloso: dentro de cada rota, ordena as paradas pelo
 *    caminho mais curto (vizinho mais próximo).
 */

interface OrderWithLocation {
  id: number;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  customerStreet: string | null;
  customerNumber: string | null;
  customerNeighborhood: string | null;
  customerCity: string | null;
  latitude?: number;
  longitude?: number;
  totalAmount: string;
}

interface RouteAssignment {
  deliveryUserId: number;
  deliveryUserName: string;
  orders: OrderWithLocation[];
  estimatedDistance: number;
}

// ─── MAPA DE BAIRROS DE UBERLÂNDIA ──────────────────────────────────────────
// Coordenadas aproximadas dos centróides de bairros de Uberlândia-MG.
// Usado como fallback quando não há lat/lon no pedido.
const NEIGHBORHOOD_COORDS: Record<string, [number, number]> = {
  // Centro e adjacentes
  "centro": [-18.9186, -48.2772],
  "fundinho": [-18.9120, -48.2780],
  "osvaldo rezende": [-18.9230, -48.2650],
  "nossa senhora aparecida": [-18.9280, -48.2600],
  "tabajaras": [-18.9350, -48.2580],
  "cazeca": [-18.9200, -48.2700],
  "bom jesus": [-18.9400, -48.2650],
  "martins": [-18.9250, -48.2730],
  "saraiva": [-18.9300, -48.2680],

  // Zona Norte
  "luizote de freitas": [-18.8950, -48.2900],
  "chácaras tubalina": [-18.8800, -48.2950],
  "tubalina": [-18.8850, -48.2900],
  "jardim brasília": [-18.8780, -48.2800],
  "jardim europa": [-18.8820, -48.2750],
  "dom almir": [-18.8700, -48.2850],
  "tocantins": [-18.8650, -48.2800],
  "morumbi": [-18.8600, -48.2900],
  "residencial gramado": [-18.8550, -48.2950],
  "jardim karaíba": [-18.8900, -48.2700],
  "custódio pereira": [-18.8950, -48.2650],
  "tibery": [-18.9050, -48.2600],
  "jaraguá": [-18.9100, -48.2550],
  "shopping park": [-18.8750, -48.2650],
  "planalto": [-18.8700, -48.2700],
  "jardim patrícia": [-18.8650, -48.2750],

  // Zona Sul
  "santa mônica": [-18.9500, -48.2750],
  "umuarama": [-18.9550, -48.2700],
  "morada da colina": [-18.9600, -48.2650],
  "jardim inconfidência": [-18.9650, -48.2600],
  "pampulha": [-18.9700, -48.2550],
  "gávea": [-18.9750, -48.2500],
  "mansões aeroporto": [-18.9800, -48.2450],
  "vigilato pereira": [-18.9450, -48.2800],
  "jardim botânico": [-18.9400, -48.2850],
  "lagoinha": [-18.9350, -48.2900],
  "segismundo pereira": [-18.9500, -48.2850],
  "laranjeiras": [-18.9550, -48.2800],
  "aurora": [-18.9600, -48.2750],

  // Zona Leste
  "lídice": [-18.9200, -48.2400],
  "brasil": [-18.9250, -48.2350],
  "alto umuarama": [-18.9300, -48.2300],
  "jardim canaã": [-18.9350, -48.2250],
  "taiaman": [-18.9150, -48.2350],
  "marta helena": [-18.9100, -48.2400],
  "ipanema": [-18.9050, -48.2450],
  "residencial integração": [-18.9000, -48.2400],
  "jardim europa leste": [-18.8950, -48.2350],

  // Zona Oeste
  "chácaras panorama": [-18.9200, -48.3100],
  "jardim das palmeiras": [-18.9150, -48.3050],
  "nova uberlândia": [-18.9100, -48.3000],
  "cidade jardim": [-18.9050, -48.3050],
  "presidente roosevelt": [-18.9000, -48.3100],
  "minas gerais": [-18.8950, -48.3150],
  "patrimônio": [-18.9250, -48.3050],
  "dom bosco": [-18.9300, -48.3000],
  "aclimação": [-18.9350, -48.2950],

  // Distritos e periferia
  "cruzeiro dos peixotos": [-18.7800, -48.2500],
  "martinésia": [-18.7500, -48.2200],
  "miraporanga": [-18.8200, -48.1800],
  "tapuirama": [-18.8500, -48.1500],
  "district industrial": [-18.8800, -48.3200],
};

const DEFAULT_COORDS: [number, number] = [-18.9186, -48.2772]; // Centro de Uberlândia

/**
 * Retorna as coordenadas de um pedido.
 * Prioridade: lat/lon do pedido → centróide do bairro → centro da cidade.
 */
function getOrderCoords(order: OrderWithLocation): [number, number] {
  if (order.latitude !== undefined && order.longitude !== undefined) {
    return [order.latitude, order.longitude];
  }
  const neighborhood = (order.customerNeighborhood ?? "").toLowerCase().trim();
  if (neighborhood && NEIGHBORHOOD_COORDS[neighborhood]) {
    return NEIGHBORHOOD_COORDS[neighborhood] as [number, number];
  }
  // Tenta match parcial
  for (const entry of Object.entries(NEIGHBORHOOD_COORDS)) {
    const key = entry[0];
    const coords = entry[1] as [number, number];
    if (neighborhood.includes(key) || key.includes(neighborhood)) {
      return coords;
    }
  }
  return DEFAULT_COORDS as [number, number];
}

/**
 * Fórmula de Haversine: distância em km entre dois pontos geográficos.
 */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calcula a distância total de uma rota usando o algoritmo do vizinho mais próximo (TSP guloso).
 * Retorna a distância total estimada em km.
 */
function routeDistance(
  orderedStops: OrderWithLocation[],
  startLat: number,
  startLon: number
): number {
  if (orderedStops.length === 0) return 0;
  let total = 0;
  let prevLat = startLat;
  let prevLon = startLon;
  for (const stop of orderedStops) {
    const [lat, lon] = getOrderCoords(stop);
    total += haversine(prevLat, prevLon, lat, lon);
    prevLat = lat;
    prevLon = lon;
  }
  return total;
}

/**
 * Ordena as paradas de uma rota pelo algoritmo do vizinho mais próximo (TSP guloso).
 * Minimiza a distância total percorrida dentro da rota.
 */
function sortRouteByNearestNeighbor(
  stops: OrderWithLocation[],
  startLat: number,
  startLon: number
): OrderWithLocation[] {
  if (stops.length <= 1) return stops;
  const remaining = [...stops];
  const sorted: OrderWithLocation[] = [];
  let curLat = startLat;
  let curLon = startLon;

  while (remaining.length > 0) {
    let minDist = Infinity;
    let minIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      const [lat, lon] = getOrderCoords(remaining[i]);
      const d = haversine(curLat, curLon, lat, lon);
      if (d < minDist) {
        minDist = d;
        minIdx = i;
      }
    }
    const next = remaining.splice(minIdx, 1)[0];
    sorted.push(next);
    [curLat, curLon] = getOrderCoords(next);
  }
  return sorted;
}

/**
 * K-Means adaptado para clustering geográfico de pedidos.
 * Retorna k grupos de pedidos geograficamente próximos.
 */
function kMeansClustering(
  orderList: OrderWithLocation[],
  k: number,
  maxIterations = 20
): OrderWithLocation[][] {
  if (k >= orderList.length) {
    // Cada pedido vira seu próprio cluster
    return orderList.map(o => [o]);
  }

  // Inicializa centróides com K-Means++ (spread inicial)
  const coords = orderList.map(o => getOrderCoords(o));
  const centroids: [number, number][] = [];

  // Primeiro centróide: pedido mais próximo do centro da cidade
  let firstIdx = 0;
  let minDistToCenter = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversine(DEFAULT_COORDS[0], DEFAULT_COORDS[1], coords[i][0], coords[i][1]);
    if (d < minDistToCenter) {
      minDistToCenter = d;
      firstIdx = i;
    }
  }
  centroids.push(coords[firstIdx]);

  // Demais centróides: maximiza distância dos já escolhidos
  while (centroids.length < k) {
    let maxMinDist = -Infinity;
    let bestIdx = 0;
    for (let i = 0; i < coords.length; i++) {
      const minD = Math.min(...centroids.map(c => haversine(c[0], c[1], coords[i][0], coords[i][1])));
      if (minD > maxMinDist) {
        maxMinDist = minD;
        bestIdx = i;
      }
    }
    centroids.push(coords[bestIdx]);
  }

  let assignments = new Array(orderList.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Atribui cada pedido ao centróide mais próximo
    const newAssignments = orderList.map((_, i) => {
      let minD = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        const d = haversine(coords[i][0], coords[i][1], centroids[c][0], centroids[c][1]);
        if (d < minD) {
          minD = d;
          bestCluster = c;
        }
      }
      return bestCluster;
    });

    // Verifica convergência
    const changed = newAssignments.some((a, i) => a !== assignments[i]);
    assignments = newAssignments;
    if (!changed) break;

    // Recalcula centróides
    for (let c = 0; c < k; c++) {
      const clusterCoords = coords.filter((_, i) => assignments[i] === c);
      if (clusterCoords.length > 0) {
        centroids[c] = [
          clusterCoords.reduce((s, p) => s + p[0], 0) / clusterCoords.length,
          clusterCoords.reduce((s, p) => s + p[1], 0) / clusterCoords.length,
        ];
      }
    }
  }

  // Monta os clusters
  const clusters: OrderWithLocation[][] = Array.from({ length: k }, () => []);
  orderList.forEach((order, i) => clusters[assignments[i]].push(order));

  // Remove clusters vazios
  return clusters.filter(c => c.length > 0);
}

/**
 * Equilíbrio de KM entre rotas.
 * Redistribui pedidos entre rotas para que a distância estimada de cada uma
 * seja similar. Usa transferências iterativas do cluster mais pesado para o
 * mais leve.
 */
function balanceRoutesByDistance(
  clusters: OrderWithLocation[][],
  startLat: number,
  startLon: number,
  maxIterations = 50
): OrderWithLocation[][] {
  if (clusters.length <= 1) return clusters;

  // Ordena cada cluster internamente
  let routes = clusters.map(c => sortRouteByNearestNeighbor(c, startLat, startLon));

  for (let iter = 0; iter < maxIterations; iter++) {
    const distances = routes.map(r => routeDistance(r, startLat, startLon));
    const maxDist = Math.max(...distances);
    const minDist = Math.min(...distances);

    // Para se o desequilíbrio for menor que 20%
    if (maxDist === 0 || (maxDist - minDist) / maxDist < 0.20) break;

    const heavyIdx = distances.indexOf(maxDist);
    const lightIdx = distances.indexOf(minDist);

    if (routes[heavyIdx].length <= 1) break;

    // Encontra o pedido do cluster pesado que, se transferido, mais equilibra as rotas
    let bestTransferIdx = -1;
    let bestImprovement = -Infinity;

    for (let i = 0; i < routes[heavyIdx].length; i++) {
      const order = routes[heavyIdx][i];
      const [oLat, oLon] = getOrderCoords(order);

      // Distância deste pedido ao centróide do cluster leve
      const lightCentroid = routes[lightIdx].length > 0
        ? getOrderCoords(routes[lightIdx][Math.floor(routes[lightIdx].length / 2)])
        : [startLat, startLon] as [number, number];

      const distToLight = haversine(oLat, oLon, lightCentroid[0], lightCentroid[1]);
      const distToHeavyCentroid = routes[heavyIdx].length > 1
        ? haversine(oLat, oLon, ...getOrderCoords(routes[heavyIdx][Math.floor(routes[heavyIdx].length / 2)]))
        : 0;

      // Prefere transferir pedidos que estão mais próximos do cluster leve
      const improvement = distToHeavyCentroid - distToLight;
      if (improvement > bestImprovement) {
        bestImprovement = improvement;
        bestTransferIdx = i;
      }
    }

    if (bestTransferIdx < 0) break;

    // Transfere o pedido
    const [transferred] = routes[heavyIdx].splice(bestTransferIdx, 1);
    routes[lightIdx].push(transferred);

    // Reordena os clusters afetados
    routes[heavyIdx] = sortRouteByNearestNeighbor(routes[heavyIdx], startLat, startLon);
    routes[lightIdx] = sortRouteByNearestNeighbor(routes[lightIdx], startLat, startLon);
  }

  return routes.filter(r => r.length > 0);
}

/**
 * Algoritmo principal de roteirização inteligente.
 * Combina clustering geográfico + equilíbrio de KM + ordenação TSP.
 */
function smartRouteOptimization(
  orderList: OrderWithLocation[],
  deliveryUsers: Array<{ id: number; name: string }>,
  startingAddress: string
): RouteAssignment[] {
  // Extrai coordenadas do endereço de saída (fallback: centro de Uberlândia)
  let startLat = DEFAULT_COORDS[0];
  let startLon = DEFAULT_COORDS[1];

  // Tenta extrair bairro do endereço de saída
  const addressParts = startingAddress.split(",").map(s => s.trim().toLowerCase());
  for (const part of addressParts) {
    if (NEIGHBORHOOD_COORDS[part]) {
      [startLat, startLon] = NEIGHBORHOOD_COORDS[part];
      break;
    }
  }

  const k = deliveryUsers.length;

  // Etapa 1: Clustering geográfico
  const clusters = kMeansClustering(orderList, k);

  // Etapa 2: Equilíbrio de KM
  const balancedRoutes = balanceRoutesByDistance(clusters, startLat, startLon);

  // Etapa 3: Atribui entregadores aos clusters (o cluster mais próximo do ponto de saída
  // vai para o primeiro entregador, etc.)
  const clusterDistances = balancedRoutes.map(route => {
    if (route.length === 0) return Infinity;
    const [firstLat, firstLon] = getOrderCoords(route[0]);
    return haversine(startLat, startLon, firstLat, firstLon);
  });

  // Ordena clusters por distância do ponto de saída
  const sortedClusterIndices = clusterDistances
    .map((d, i) => ({ d, i }))
    .sort((a, b) => a.d - b.d)
    .map(x => x.i);

  const result: RouteAssignment[] = [];

  for (let ui = 0; ui < Math.min(deliveryUsers.length, balancedRoutes.length); ui++) {
    const clusterIdx = sortedClusterIndices[ui] ?? ui;
    const route = balancedRoutes[clusterIdx] ?? [];
    const user = deliveryUsers[ui];

    const sortedOrders = sortRouteByNearestNeighbor(route, startLat, startLon);
    const estimatedDistance = routeDistance(sortedOrders, startLat, startLon);

    result.push({
      deliveryUserId: user.id,
      deliveryUserName: user.name,
      orders: sortedOrders,
      estimatedDistance,
    });
  }

  return result.filter(r => r.orders.length > 0);
}

/**
 * Calcula distância entre dois pontos (para persistência no banco).
 */
function calculateDistance(
  lat1: number | undefined,
  lon1: number | undefined,
  lat2: number | undefined,
  lon2: number | undefined,
  neighborhood1: string,
  neighborhood2: string
): number {
  if (lat1 !== undefined && lon1 !== undefined && lat2 !== undefined && lon2 !== undefined) {
    return haversine(lat1, lon1, lat2, lon2);
  }
  const n1 = neighborhood1.toLowerCase().trim();
  const n2 = neighborhood2.toLowerCase().trim();
  const c1 = (NEIGHBORHOOD_COORDS[n1] ?? DEFAULT_COORDS) as [number, number];
  const c2 = (NEIGHBORHOOD_COORDS[n2] ?? DEFAULT_COORDS) as [number, number];
  return haversine(c1[0], c1[1], c2[0], c2[1]);
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────

export const routeOptimizationRouter = router({
  /**
   * Gera rotas otimizadas com clustering geográfico + equilíbrio de KM.
   * Aceita lista de IDs de pedidos selecionados OU busca por período.
   */
  generateOptimizedRoutes: protectedProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
      deliveryUserIds: z.array(z.number()).min(1),
      selectedOrderIds: z.array(z.number()).optional(), // Pedidos selecionados manualmente
      startingAddress: z.string().default("Rua Eloi da Costa, 145, Luizote de Freitas, Uberlândia, MG"),
      routeNamePrefix: z.string().default("Rota Otimizada"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let availableOrders: OrderWithLocation[];

      if (input.selectedOrderIds && input.selectedOrderIds.length > 0) {
        // Usa os pedidos selecionados manualmente
        const rows = await db.select({
          id: orders.id,
          customerName: customers.name,
          customerPhone: customers.phone,
          deliveryAddress: orders.deliveryAddress,
          customerStreet: customers.street,
          customerNumber: customers.number,
          customerNeighborhood: customers.neighborhood,
          customerCity: customers.city,
          totalAmount: orders.totalAmount,
        })
          .from(orders)
          .leftJoin(customers, eq(orders.customerId, customers.id))
          .where(
            and(
              inArray(orders.id, input.selectedOrderIds),
              eq(orders.status, "production")
            )
          );
        availableOrders = rows as OrderWithLocation[];
      } else {
        // Busca todos os pedidos em "production" dentro do período
        const dateFromObj = new Date(input.dateFrom);
        const dateToObj = new Date(input.dateTo);
        dateToObj.setHours(23, 59, 59);

        const rows = await db.select({
          id: orders.id,
          customerName: customers.name,
          customerPhone: customers.phone,
          deliveryAddress: orders.deliveryAddress,
          customerStreet: customers.street,
          customerNumber: customers.number,
          customerNeighborhood: customers.neighborhood,
          customerCity: customers.city,
          totalAmount: orders.totalAmount,
        })
          .from(orders)
          .leftJoin(customers, eq(orders.customerId, customers.id))
          .where(
            and(
              eq(orders.status, "production"),
              gte(orders.createdAt, dateFromObj),
              lte(orders.createdAt, dateToObj)
            )
          );
        availableOrders = rows as OrderWithLocation[];
      }

      if (availableOrders.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nenhum pedido disponível para roteirização.",
        });
      }

      // Busca dados dos entregadores
      const deliveryUsers = await db.select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, input.deliveryUserIds));

      if (deliveryUsers.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nenhum entregador válido fornecido.",
        });
      }

      // ─── ROTEIRIZAÇÃO INTELIGENTE ─────────────────────────────────────────
      const optimizedRoutes = smartRouteOptimization(
        availableOrders,
        deliveryUsers,
        input.startingAddress
      );

      // Cria as rotas no banco de dados
      const createdRoutes = [];

      for (const optimizedRoute of optimizedRoutes) {
        const routeValues: any = {
          name: `${input.routeNamePrefix} - ${optimizedRoute.deliveryUserName}`,
          deliveryDate: new Date(input.dateFrom),
          deliveryUserId: optimizedRoute.deliveryUserId,
          totalDistance: optimizedRoute.estimatedDistance.toFixed(2),
          createdBy: ctx.user.id,
          status: "planned",
        };

        if (input.startingAddress && input.startingAddress.trim() !== "") {
          routeValues.startingAddress = input.startingAddress;
        }

        const routeResult = await db.insert(deliveryRoutes).values(routeValues);
        const routeId = Number((routeResult as any).insertId);

        // Insere os pedidos na rota com distâncias calculadas
        for (let i = 0; i < optimizedRoute.orders.length; i++) {
          const order = optimizedRoute.orders[i];
          let distanceFromPrevious = 0;

          if (i === 0) {
            const [oLat, oLon] = getOrderCoords(order);
            distanceFromPrevious = haversine(
              startLat(input.startingAddress),
              startLon(input.startingAddress),
              oLat,
              oLon
            );
          } else {
            const prevOrder = optimizedRoute.orders[i - 1];
            const [pLat, pLon] = getOrderCoords(prevOrder);
            const [oLat, oLon] = getOrderCoords(order);
            distanceFromPrevious = haversine(pLat, pLon, oLat, oLon);
          }

          await db.insert(routeOrders).values({
            routeId,
            orderId: order.id,
            position: i + 1,
            distanceFromPrevious: distanceFromPrevious.toFixed(2),
          });
        }

        // Atualiza status dos pedidos para "in_route"
        const routeOrderIds = optimizedRoute.orders.map(o => o.id);
        await db.update(orders)
          .set({ status: "in_route" })
          .where(inArray(orders.id, routeOrderIds));

        // Calcula bairros únicos desta rota para o resumo
        const neighborhoodSet = new Set(
          optimizedRoute.orders
            .map(o => o.customerNeighborhood)
            .filter((n): n is string => !!n)
        );
        const neighborhoods = Array.from(neighborhoodSet);

        createdRoutes.push({
          routeId,
          deliveryUserId: optimizedRoute.deliveryUserId,
          deliveryUserName: optimizedRoute.deliveryUserName,
          orderCount: optimizedRoute.orders.length,
          estimatedDistance: optimizedRoute.estimatedDistance,
          neighborhoods,
        });
      }

      return {
        success: true,
        routesCreated: createdRoutes,
        totalOrders: availableOrders.length,
        totalRoutes: createdRoutes.length,
      };
    }),

  /**
   * Lista pedidos disponíveis para roteamento em um período.
   * Retorna pedidos com bairro para facilitar a seleção manual.
   */
  availableOrdersForPeriod: protectedProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const dateFromObj = new Date(input.dateFrom);
      const dateToObj = new Date(input.dateTo);
      dateToObj.setHours(23, 59, 59);

      const rows = await db.select({
        id: orders.id,
        totalAmount: orders.totalAmount,
        deliveryDate: orders.deliveryDate,
        deliveryAddress: orders.deliveryAddress,
        status: orders.status,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerStreet: customers.street,
        customerNumber: customers.number,
        customerNeighborhood: customers.neighborhood,
        customerCity: customers.city,
        deliveryMethodName: deliveryMethods.name,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .where(
          and(
            eq(orders.status, "production"),
            gte(orders.createdAt, dateFromObj),
            lte(orders.createdAt, dateToObj)
          )
        )
        .orderBy(asc(customers.neighborhood));

      return rows;
    }),

  /**
   * Atualiza o endereço de saída de uma rota.
   */
  updateRouteStartingAddress: protectedProcedure
    .input(z.object({
      routeId: z.number(),
      startingAddress: z.string().min(5),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(deliveryRoutes)
        .set({ startingAddress: input.startingAddress })
        .where(eq(deliveryRoutes.id, input.routeId));

      return { success: true };
    }),

  /**
   * Exclui uma ou mais rotas e reverte os pedidos para "production".
   */
  deleteRoutes: protectedProcedure
    .input(z.object({
      routeIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      for (const routeId of input.routeIds) {
        // Busca os pedidos desta rota
        const routeOrderRows = await db.select({ orderId: routeOrders.orderId })
          .from(routeOrders)
          .where(eq(routeOrders.routeId, routeId));

        const orderIds = routeOrderRows.map(r => r.orderId);

        // Reverte pedidos para "production"
        if (orderIds.length > 0) {
          await db.update(orders)
            .set({ status: "production" })
            .where(inArray(orders.id, orderIds));
        }

        // Remove os registros de route_orders
        await db.delete(routeOrders).where(eq(routeOrders.routeId, routeId));

        // Remove a rota
        await db.delete(deliveryRoutes).where(eq(deliveryRoutes.id, routeId));
      }

      return { success: true, deletedCount: input.routeIds.length };
    }),
});

// Helpers para extrair lat/lon do endereço de saída
function startLat(address: string): number {
  const parts = address.split(",").map(s => s.trim().toLowerCase());
  for (const part of parts) {
    if (NEIGHBORHOOD_COORDS[part]) return NEIGHBORHOOD_COORDS[part][0];
  }
  return DEFAULT_COORDS[0];
}

function startLon(address: string): number {
  const parts = address.split(",").map(s => s.trim().toLowerCase());
  for (const part of parts) {
    if (NEIGHBORHOOD_COORDS[part]) return NEIGHBORHOOD_COORDS[part][1];
  }
  return DEFAULT_COORDS[1];
}
