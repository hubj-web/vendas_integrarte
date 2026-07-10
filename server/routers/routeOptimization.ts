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
  status: "production" | "in_route" | "packaged" | "delivered" | "paid" | "cancelled";
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

// ─── DISTANCE MATRIX API ─────────────────────────────────────────────────────

/**
 * Calcula a matriz de distâncias entre todos os pontos usando Distance Matrix API.
 * Retorna uma matriz 2D onde matrix[i][j] = distância em metros de i para j.
 * Lotes de até 25 origens × 25 destinos para respeitar o limite da API.
 */
async function calculateDistanceMatrix(
  points: { latitude: number; longitude: number }[]
): Promise<number[][] | null> {
  const n = points.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  // Processar em lotes de 25 origens
  for (let batchStart = 0; batchStart < n; batchStart += 25) {
    const batchEnd = Math.min(batchStart + 25, n);
    const batchOrigins = points.slice(batchStart, batchEnd);

    const originsStr = batchOrigins.map(p => `${p.latitude},${p.longitude}`).join("|");

    // Processar em lotes de 25 destinos
    for (let destStart = 0; destStart < n; destStart += 25) {
      const destEnd = Math.min(destStart + 25, n);
      const batchDestinations = points.slice(destStart, destEnd);

      const destinationsStr = batchDestinations.map(p => `${p.latitude},${p.longitude}`).join("|");

      const result = await googleMapsClient.getDistanceMatrix(originsStr, destinationsStr);
      if (!result) {
        console.warn(`[DistanceMatrix] Falha ao calcular matriz batch [${batchStart}-${batchEnd}] × [${destStart}-${destEnd}]`);
        return null;
      }

      // Preencher a matriz
      for (let i = 0; i < batchOrigins.length; i++) {
        for (let j = 0; j < batchDestinations.length; j++) {
          const element = result.rows[i]?.elements?.[j];
          if (element?.status === "OK" && element.distance?.value) {
            matrix[batchStart + i][destStart + j] = element.distance.value;
          } else {
            // Fallback para distância euclidiana
            const euclidean = Math.sqrt(
              Math.pow(batchOrigins[i].latitude - batchDestinations[j].latitude, 2) +
              Math.pow(batchOrigins[i].longitude - batchDestinations[j].longitude, 2)
            ) * 111000;
            matrix[batchStart + i][destStart + j] = Math.round(euclidean);
            console.warn(`[DistanceMatrix] Fallback euclidiana para ponto [${batchStart + i}] → [${destStart + j}]: ${Math.round(euclidean)}m`);
          }
        }
      }
    }
  }

  return matrix;
}

// ─── FUNÇÕES AUXILIARES ─────────────────────────────────────────────────────

/**
 * Ordena os pedidos dentro de uma rota usando o algoritmo do vizinho mais próximo
 * baseado em uma matriz de distância real.
 */
function orderStopsByNearestNeighbor(
  ordersInRoute: number[],
  originIndex: number,
  distanceMatrix: number[][]
): number[] {
  if (ordersInRoute.length <= 1) return ordersInRoute;

  const remaining = [...ordersInRoute];
  const ordered: number[] = [];
  let currentIdx = originIndex;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dist = distanceMatrix[currentIdx][remaining[i]];
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const chosen = remaining.splice(nearestIdx, 1)[0];
    ordered.push(chosen);
    currentIdx = chosen;
  }

  return ordered;
}

/**
 * Calcula a distância total de uma rota (origem → paradas → origem) usando a matriz de distância.
 * Inclui a volta ao ponto de origem para o KM total real.
 */
function calculateRouteTotalDistance(
  orderedStops: number[],
  originIndex: number,
  distanceMatrix: number[][]
): number {
  if (orderedStops.length === 0) return 0;

  let total = distanceMatrix[originIndex][orderedStops[0]]; // origem → primeira parada

  for (let i = 1; i < orderedStops.length; i++) {
    total += distanceMatrix[orderedStops[i - 1]][orderedStops[i]];
  }

  total += distanceMatrix[orderedStops[orderedStops.length - 1]][originIndex]; // última parada → origem

  return total;
}

/**
 * Agrupa pedidos em rotas balanceadas por KM total usando a matriz de distância real.
 * Algoritmo: First-Fit Decreasing (FFD) adaptado para balanceamento de distância.
 */
function balanceRoutesByDistance(
  ordersToProcess: OrderWithLocation[],
  allPoints: { latitude: number; longitude: number }[],
  originIndex: number,
  distanceMatrix: number[][],
  numRoutes: number
): number[][] {
  const clusters: number[][] = Array.from({ length: numRoutes }, () => []);
  const routeTotalDistance: number[] = Array(numRoutes).fill(0);

  // Ordenar pedidos pela distância da origem (mais distantes primeiro) para melhor balanceamento
  const ordersWithDistance = ordersToProcess.map((o, i) => ({
    index: i,
    distFromOrigin: distanceMatrix[originIndex][i],
  })).sort((a, b) => b.distFromOrigin - a.distFromOrigin);

  for (const order of ordersWithDistance) {
    const orderIdx = order.index;

    // Encontrar a rota que resultará no menor KM total após adicionar este pedido
    let bestRoute = 0;
    let bestNewDistance = Infinity;

    for (let r = 0; r < numRoutes; r++) {
      // Simular adição à rota r: recalcular a rota completa com vizinho mais próximo
      const simulatedCluster = [...clusters[r], orderIdx];
      const simulatedOrdered = orderStopsByNearestNeighbor(simulatedCluster, originIndex, distanceMatrix);
      const simulatedDistance = calculateRouteTotalDistance(simulatedOrdered, originIndex, distanceMatrix);

      if (simulatedDistance < bestNewDistance) {
        bestNewDistance = simulatedDistance;
        bestRoute = r;
      }
    }

    clusters[bestRoute].push(orderIdx);
    routeTotalDistance[bestRoute] = bestNewDistance;
  }

  // Ordenar paradas dentro de cada rota usando vizinho mais próximo
  for (let r = 0; r < numRoutes; r++) {
    if (clusters[r].length > 0) {
      clusters[r] = orderStopsByNearestNeighbor(clusters[r], originIndex, distanceMatrix);
    }
  }

  return clusters;
}

/**
 * Agrupamento simples por proximidade geográfica (fallback quando Distance Matrix falha)
 */
function clusterOrdersByProximity(
  ordersToProcess: OrderWithLocation[],
  originCoords: { latitude: number; longitude: number },
  numRoutes: number
): number[][] {
  const ordersWithDistance = ordersToProcess.map((o) => ({
    index: ordersToProcess.indexOf(o),
    dist: Math.sqrt(
      Math.pow(o.latitude! - originCoords.latitude, 2) +
      Math.pow(o.longitude! - originCoords.longitude, 2)
    ),
  }));

  ordersWithDistance.sort((a, b) => b.dist - a.dist);

  const clusters: number[][] = Array.from({ length: numRoutes }, () => []);

  for (let i = 0; i < ordersWithDistance.length; i++) {
    let bestCluster = 0;
    let bestDist = Infinity;
    for (let c = 0; c < numRoutes; c++) {
      const orderIdx = ordersWithDistance[i].index;
      const order = ordersToProcess[orderIdx];
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
    clusters[bestCluster].push(ordersWithDistance[i].index);
  }

  return clusters;
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
      const numRoutes = Math.min(input.numRoutes, ordersToProcess.length);

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

        // Fallback final (centro) com um pequeno offset
        if (!coords) {
          coords = {
            latitude: -18.9186 + (Math.random() - 0.5) * 0.01,
            longitude: -48.2772 + (Math.random() - 0.5) * 0.01
          };
          console.warn(`[Roteirização] Geocodificação falhou para pedido #${o.id}. Usando coordenadas aproximadas.`);
        }

        o.latitude = coords.latitude;
        o.longitude = coords.longitude;

        return {
          id: o.id,
          location: coords,
          label: `Pedido #${o.id} - ${o.customerName}`,
        };
      }));

      // Construir lista de todos os pontos (origem + pedidos)
      const allPoints: { latitude: number; longitude: number }[] = [
        originCoords,
        ...shipments.map(s => s.location),
      ];

      // 3. Calcular matriz de distância real via Distance Matrix API
      let distanceMatrix: number[][] | null = null;
      let useDistanceMatrix = false;

      if (googleMapsClient.isConfigured()) {
        console.log(`[Roteirização] Calculando matriz de distância real (${allPoints.length} pontos)...`);
        distanceMatrix = await calculateDistanceMatrix(allPoints);

        if (distanceMatrix) {
          useDistanceMatrix = true;
          console.log(`[Roteirização] Matriz de distância calculada com sucesso (${allPoints.length}×${allPoints.length}).`);
        } else {
          console.warn("[Roteirização] Falha ao calcular matriz de distância. Usando fallback euclidiano.");
        }
      }

      // 4. Tentar otimização via Google Maps Route Optimization API
      const vehicles = Array.from({ length: numRoutes }, (_, i) => ({
        id: i,
        displayName: `${input.routeNamePrefix} #${i + 1}`,
        startLocation: originCoords,
        endLocation: originCoords,
      }));

      let optimizationResult: any = null;
      let useGoogleApi = false;

      if (googleMapsClient.isConfigured()) {
        try {
          console.log(`[Roteirização] Chamando Google Maps Route Optimization API (${shipments.length} shipments, ${vehicles.length} vehicles)...`);
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

      // 5. Gerar clusters de rota
      let routeClusters: number[][];
      let routeMetrics: { totalDistanceMeters: number; visits: { shipmentIndex: number; distanceMeters: number }[] }[];
      const originIdx = 0; // origem é sempre o índice 0 na matriz

      if (useGoogleApi && optimizationResult?.routes) {
        // Usar rotas do Google Maps - extrair distâncias dos transitions
        routeClusters = optimizationResult.routes.map((route: any) =>
          route.visits.map((visit: any) => visit.shipmentIndex)
        );

        routeMetrics = optimizationResult.routes.map((route: any) => {
          // A API retorna transitions entre cada parada
          // O transition[i] é a distância da posição anterior até a visita[i]
          // O último transition é da última visita de volta à origem
          let totalDist = 0;
          const visits = route.visits.map((visit: any, i: number) => {
            const transitionDist = route.transitions?.[i]?.distanceMeters || 0;
            totalDist += transitionDist;
            return {
              shipmentIndex: visit.shipmentIndex,
              distanceMeters: transitionDist,
            };
          });

          // Adicionar a distância de volta à origem (último transition)
          if (route.transitions && route.transitions.length > 0) {
            const returnDist = route.transitions[route.transitions.length - 1]?.distanceMeters || 0;
            totalDist += returnDist;
          }

          return {
            totalDistanceMeters: Math.round(totalDist),
            visits,
          };
        });
      } else if (useDistanceMatrix && distanceMatrix) {
        // Usar matriz de distância real para balanceamento e ordenação
        console.log(`[Roteirização] Usando matriz de distância real para balanceamento (${numRoutes} rotas).`);

        routeClusters = balanceRoutesByDistance(
          ordersToProcess,
          allPoints,
          originIdx,
          distanceMatrix,
          numRoutes
        );

        routeMetrics = routeClusters.map((cluster) => {
          let totalDist = 0;
          const visits = cluster.map((orderIdx, i) => {
            let distFromPrev: number;
            if (i === 0) {
              distFromPrev = distanceMatrix[originIdx][orderIdx];
            } else {
              distFromPrev = distanceMatrix[cluster[i - 1]][orderIdx];
            }
            totalDist += distFromPrev;
            return {
              shipmentIndex: orderIdx,
              distanceMeters: distFromPrev,
            };
          });

          // Adicionar distância de volta à origem
          if (cluster.length > 0) {
            totalDist += distanceMatrix[cluster[cluster.length - 1]][originIdx];
          }

          return {
            totalDistanceMeters: Math.round(totalDist),
            visits,
          };
        });

        console.log(`[Roteirização] Fallback com matriz real gerou ${routeClusters.length} rotas.`);
      } else {
        // Fallback: agrupamento por proximidade geográfica com distância euclidiana
        console.log(`[Roteirização] Usando agrupamento por proximidade euclidiana (${numRoutes} rotas).`);
        routeClusters = clusterOrdersByProximity(ordersToProcess, originCoords, numRoutes);

        // Ordenar paradas usando vizinho mais próximo com distância euclidiana
        routeClusters = routeClusters.map((cluster) =>
          orderStopsByNearestNeighbor(
            cluster,
            originIdx,
            // Criar matriz euclidiana temporária
            (() => {
              const n = allPoints.length;
              const mat: number[][] = Array.from({ length: n }, (_, i) =>
                Array.from({ length: n }, (_, j) => {
                  if (i === j) return 0;
                  return Math.round(
                    Math.sqrt(
                      Math.pow(allPoints[i].latitude - allPoints[j].latitude, 2) +
                      Math.pow(allPoints[i].longitude - allPoints[j].longitude, 2)
                    ) * 111000
                  );
                })
              );
              return mat;
            })()
          )
        );

        // Calcular métricas aproximadas
        routeMetrics = routeClusters.map((cluster) => {
          let totalDist = 0;
          const visits = cluster.map((orderIdx, i) => {
            let distFromPrev: number;
            if (i === 0) {
              distFromPrev = Math.round(
                Math.sqrt(
                  Math.pow(ordersToProcess[orderIdx].latitude! - originCoords.latitude, 2) +
                  Math.pow(ordersToProcess[orderIdx].longitude! - originCoords.longitude, 2)
                ) * 111000
              );
            } else {
              distFromPrev = Math.round(
                Math.sqrt(
                  Math.pow(ordersToProcess[orderIdx].latitude! - ordersToProcess[cluster[i - 1]].latitude!, 2) +
                  Math.pow(ordersToProcess[orderIdx].longitude! - ordersToProcess[cluster[i - 1]].longitude!, 2)
                ) * 111000
              );
            }
            totalDist += distFromPrev;
            return {
              shipmentIndex: orderIdx,
              distanceMeters: distFromPrev,
            };
          });

          // Adicionar distância de volta à origem
          if (cluster.length > 0) {
            totalDist += Math.round(
              Math.sqrt(
                Math.pow(ordersToProcess[cluster[cluster.length - 1]].latitude! - originCoords.latitude, 2) +
                Math.pow(ordersToProcess[cluster[cluster.length - 1]].longitude! - originCoords.longitude, 2)
              ) * 111000
            );
          }

          return {
            totalDistanceMeters: Math.round(totalDist),
            visits,
          };
        });
      }

      // 6. Salva as rotas no banco
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

      // Logar resumo das rotas criadas
      console.log(`[Roteirização] === Resumo das Rotas ===`);
      for (let i = 0; i < routeMetrics.length; i++) {
        const km = (routeMetrics[i].totalDistanceMeters / 1000).toFixed(1);
        const stops = routeClusters[i]?.length || 0;
        console.log(`[Roteirização] Rota #${i + 1}: ${stops} paradas, ${km} km`);
      }

      return {
        totalRoutes: createdRouteIds.length,
        totalOrders: input.selectedOrderIds.length,
        routeIds: createdRouteIds,
        message: `${createdRouteIds.length} rota(s) criada(s) com sucesso!${
          useGoogleApi
            ? " (otimizadas pelo Google Maps)"
            : useDistanceMatrix
              ? " (balanceadas por distância real de estrada)"
              : " (agrupadas por proximidade)"
        }`,
      };
    }),

  /**
   * Recalcula as distâncias de uma rota existente usando a Distance Matrix API.
   * Atualiza distanceFromPrevious em cada routeOrder e totalDistance na deliveryRoute.
   */
  recalculateRouteDistances: protectedProcedure
    .input(z.object({ routeId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (!googleMapsClient.isConfigured()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Google Maps API não configurada. Configure GOOGLE_MAPS_API_KEY.",
        });
      }

      // Buscar dados da rota
      const route = await db.select()
        .from(deliveryRoutes)
        .where(eq(deliveryRoutes.id, input.routeId))
        .limit(1);

      if (!route[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Rota não encontrada." });
      }

      const routeData = route[0];

      // Buscar pedidos da rota em ordem
      const routeOrderRows = await db
        .select({
          id: routeOrders.id,
          orderId: routeOrders.orderId,
          position: routeOrders.position,
          distanceFromPrevious: routeOrders.distanceFromPrevious,
          customerStreet: customers.street,
          customerNumber: customers.number,
          customerNeighborhood: customers.neighborhood,
          customerCity: customers.city,
          deliveryAddress: orders.deliveryAddress,
        })
        .from(routeOrders)
        .leftJoin(orders, eq(routeOrders.orderId, orders.id))
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(eq(routeOrders.routeId, input.routeId))
        .orderBy(asc(routeOrders.position));

      if (routeOrderRows.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Rota sem pedidos." });
      }

      // Geocodificar a origem
      const originCoords = await googleMapsClient.geocode(routeData.startingAddress || "Uberlândia, MG");
      if (!originCoords) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não foi possível geocodificar o endereço de origem.",
        });
      }

      // Geocodificar cada pedido
      const points: { latitude: number; longitude: number }[] = [originCoords];
      const orderDetails: typeof routeOrderRows = [];

      for (const row of routeOrderRows) {
        const addr = row.deliveryAddress && row.deliveryAddress.length > 10
          ? row.deliveryAddress
          : [row.customerStreet, row.customerNumber, row.customerNeighborhood, row.customerCity, "MG"].filter(Boolean).join(", ");

        let coords = await googleMapsClient.geocode(addr);

        if (!coords && row.customerNeighborhood) {
          const neighborhood = row.customerNeighborhood.toLowerCase().trim();
          const fallback = NEIGHBORHOOD_COORDS[neighborhood];
          if (fallback) coords = { latitude: fallback.lat, longitude: fallback.lng };
        }

        if (!coords) {
          coords = {
            latitude: -18.9186 + (Math.random() - 0.5) * 0.01,
            longitude: -48.2772 + (Math.random() - 0.5) * 0.01
          };
        }

        points.push(coords);
        orderDetails.push(row);
      }

      // Calcular matriz de distância
      console.log(`[RecalcularDistâncias] Calculando matriz para ${points.length} pontos...`);
      const distanceMatrix = await calculateDistanceMatrix(points);

      if (!distanceMatrix) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Falha ao calcular matriz de distância.",
        });
      }

      // Ordenar paradas pelo vizinho mais próximo
      const orderIndices = orderDetails.map((_, i) => i + 1); // +1 porque índice 0 é a origem
      const orderedIndices = orderStopsByNearestNeighbor(orderIndices, 0, distanceMatrix);

      // Calcular distâncias e atualizar o banco
      let totalDistance = 0;
      for (let i = 0; i < orderedIndices.length; i++) {
        const pointIdx = orderedIndices[i];
        const row = orderDetails[pointIdx - 1];

        let distFromPrev: number;
        if (i === 0) {
          distFromPrev = distanceMatrix[0][pointIdx]; // origem → primeira parada
        } else {
          distFromPrev = distanceMatrix[orderedIndices[i - 1]][pointIdx];
        }

        totalDistance += distFromPrev;

        // Atualizar position e distanceFromPrevious
        await db.update(routeOrders)
          .set({
            position: i + 1,
            distanceFromPrevious: (distFromPrev / 1000).toFixed(2),
          })
          .where(eq(routeOrders.id, row.id));
      }

      // Adicionar distância de volta à origem
      if (orderedIndices.length > 0) {
        totalDistance += distanceMatrix[orderedIndices[orderedIndices.length - 1]][0];
      }

      // Atualizar totalDistance da rota
      await db.update(deliveryRoutes)
        .set({
          totalDistance: (totalDistance / 1000).toFixed(2),
        })
        .where(eq(deliveryRoutes.id, input.routeId));

      console.log(`[RecalcularDistâncias] Rota #${input.routeId}: ${(totalDistance / 1000).toFixed(1)} km reais.`);

      return {
        success: true,
        totalDistance: (totalDistance / 1000).toFixed(2),
        message: `Distâncias recalculadas com sucesso! Total: ${(totalDistance / 1000).toFixed(1)} km reais de estrada.`,
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
});
