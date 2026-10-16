import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { z } from "zod";
import {
  customers, deliveryMethods, deliveryRoutes,
  orders, routeOrders, users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { googleMapsClient } from "../google-maps";
import { calculateRouteTotalDistance, orderStopsByNearestNeighbor, planRoutes, twoOptImprove, type RouteStrategy } from "../routeBalancing";

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface OrderWithLocation {
  id: number;
  totalAmount: string;
  deliveryDate: Date | null;
  deliveryAddress: string | null;
  status: "received" | "production" | "in_route" | "packaged" | "delivered" | "delivery_failed" | "paid" | "cancelled";
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
  // Preenchidos na geração das rotas:
  /** Bairro usado pra agrupar — o do ENDEREÇO DA ENTREGA (via Google), não o do cadastro do cliente. */
  groupNeighborhood?: string | null;
  /** De onde veio o endereço usado: "entrega" (endereço próprio do pedido) ou "cadastro" (endereço do cliente). */
  addressSource?: "entrega" | "cadastro";
  addressUsed?: string;
  /** ok = achou o endereço; aproximado = achou só a região/bairro; falhou = não achou (usou o centro da cidade). */
  locationQuality?: "ok" | "aproximado" | "falhou";
}

type AddressSource = Pick<OrderWithLocation, "deliveryAddress" | "customerStreet" | "customerNumber" | "customerNeighborhood" | "customerCity">;

/**
 * Escolhe o endereço que a rota deve usar. REGRA: se o pedido tem endereço de
 * entrega próprio, ele SEMPRE vale — só cai no endereço do cadastro do cliente
 * quando o pedido não tem nenhum. Devolve também de onde veio, pra mostrar na tela.
 */
function resolveAddress(o: AddressSource): { text: string; source: "entrega" | "cadastro" } {
  const delivery = (o.deliveryAddress ?? "").trim();
  if (delivery.length >= 5) {
    // Texto entre parênteses (complemento, referência) atrapalha o Google — tira só pra geocodificar.
    const clean = delivery.replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
    // Endereço digitado sem cidade ("Rua A, 123") pode cair em outra cidade — completa com a do cliente.
    const hasCity = /\bmg\b|minas gerais|uberl[aâ]ndia/i.test(clean) || (o.customerCity ? clean.toLowerCase().includes(o.customerCity.toLowerCase()) : false);
    return { text: hasCity ? clean : `${clean}, ${o.customerCity || "Uberlândia"}, MG`, source: "entrega" };
  }
  const parts = [o.customerStreet, o.customerNumber, o.customerNeighborhood, o.customerCity, "MG"];
  return { text: parts.filter(Boolean).join(", "), source: "cadastro" };
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

  // A Distance Matrix API do Google limita a 100 combinações (origens × destinos)
  // por requisição — usar lotes de 25×25 (625) sempre estourava esse limite e
  // retornava MAX_ELEMENTS_EXCEEDED. Usando lotes de 10×10 (100), fica dentro do limite.
  const BATCH_SIZE = 10;

  for (let batchStart = 0; batchStart < n; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, n);
    const batchOrigins = points.slice(batchStart, batchEnd);

    const originsStr = batchOrigins.map(p => `${p.latitude},${p.longitude}`).join("|");

    // Processar em lotes de 10 destinos (10×10 = 100, dentro do limite da API)
    for (let destStart = 0; destStart < n; destStart += BATCH_SIZE) {
      const destEnd = Math.min(destStart + BATCH_SIZE, n);
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
 * Agrupa pedidos do mesmo bairro em um único grupo "atômico" (não são separados entre
 * rotas), e distribui esses grupos entre as rotas buscando o menor KM total possível.
 * Bairros maiores são processados primeiro (para não ficarem "sobrando" no final e
 * forçarem desbalanceamento). Pedidos sem bairro cadastrado viram grupos individuais.
 */
/**
 * Normaliza o nome de um bairro para comparação: remove acentos, pontuação,
 * espaços duplicados e deixa em minúsculas. Assim "Santa Mônica", "santa monica"
 * e "Santa  Mônica " são todos reconhecidos como o mesmo bairro.
 */
function normalizeNeighborhood(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // pontuação vira espaço (ex: "Santa Monica/Finotti")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distância de edição (Levenshtein) simples, usada para detectar erros de digitação. */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function groupOrderIndicesByNeighborhood(ordersToProcess: OrderWithLocation[]): number[][] {
  const groups: Record<string, number[]> = {};
  const keyForIndex: string[] = [];

  ordersToProcess.forEach((o, i) => {
    // groupNeighborhood = bairro do endereço realmente usado (null = desconhecido). Só cai no do cadastro se não foi calculado.
    const normalized = normalizeNeighborhood(o.groupNeighborhood !== undefined ? o.groupNeighborhood : o.customerNeighborhood);
    const key = normalized || `__sem_bairro_${i}`;
    keyForIndex[i] = key;
    (groups[key] ??= []).push(i);
  });

  // Junta bairros com nomes bem parecidos (provável erro de digitação, ex:
  // "santa monicaa" vs "santa monica") no maior grupo correspondente, desde que
  // os nomes tenham tamanho razoável (evita juntar bairros curtos e genéricos por engano).
  const keys = Object.keys(groups).filter(k => !k.startsWith("__sem_bairro_"));
  const merged = new Set<string>();
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i];
    if (merged.has(a) || a.length < 5) continue;
    for (let j = i + 1; j < keys.length; j++) {
      const b = keys[j];
      if (merged.has(b) || b.length < 5) continue;
      const dist = levenshtein(a, b);
      if (dist <= 2) {
        // Junta o menor grupo dentro do maior (mantém o nome do maior como referência)
        const [bigger, smaller] = groups[a].length >= groups[b].length ? [a, b] : [b, a];
        groups[bigger].push(...groups[smaller]);
        delete groups[smaller];
        merged.add(smaller);

        // Se "a" foi o grupo apagado (ficou menor que "b" dessa vez), ele deixa
        // de existir em `groups` — não dá pra continuar comparando "a" com os
        // próximos "b"s do laço interno (isso é o que causava o erro "Cannot
        // read properties of undefined" quando havia 3+ bairros parecidos entre si).
        if (smaller === a) break;
      }
    }
  }

  return Object.values(groups);
}

function balanceRoutesByNeighborhood(
  ordersToProcess: OrderWithLocation[],
  originIndex: number,
  distanceMatrix: number[][],
  numRoutes: number
): number[][] {
  // Proteção: nunca deixa numRoutes chegar em 0/negativo/inválido aqui dentro,
  // mesmo que algo mais acima falhe em validar — evita acessar routeGroups[-1].
  const safeNumRoutes = Math.max(1, Math.floor(numRoutes) || 1);

  // routeGroups[r] = lista de grupos (bairros) atribuídos à rota r; cada grupo é uma
  // lista de índices de matriz. Mantemos os grupos separados (em vez de já juntar tudo
  // num array só) para permitir reequilibrar depois, movendo bairros inteiros entre rotas.
  const routeGroups: number[][][] = Array.from({ length: safeNumRoutes }, () => []);

  const routeDistance = (r: number): number => {
    const flat = routeGroups[r].flat();
    if (flat.length === 0) return 0;
    const ordered = orderStopsByNearestNeighbor(flat, originIndex, distanceMatrix);
    return calculateRouteTotalDistance(ordered, originIndex, distanceMatrix);
  };

  // 1) Atribuição inicial: bairros maiores primeiro, cada um vai inteiro para a rota
  //    que resultar no menor KM total após incluí-lo.
  const groups = groupOrderIndicesByNeighborhood(ordersToProcess)
    .sort((a, b) => b.length - a.length);

  for (const group of groups) {
    const groupMatrixIndices = group.map(i => i + 1);

    let bestRoute = 0;
    let bestNewDistance = Infinity;

    for (let r = 0; r < safeNumRoutes; r++) {
      const simulatedFlat = [...routeGroups[r].flat(), ...groupMatrixIndices];
      const simulatedOrdered = orderStopsByNearestNeighbor(simulatedFlat, originIndex, distanceMatrix);
      const simulatedDistance = calculateRouteTotalDistance(simulatedOrdered, originIndex, distanceMatrix);

      if (simulatedDistance < bestNewDistance) {
        bestNewDistance = simulatedDistance;
        bestRoute = r;
      }
    }

    routeGroups[bestRoute].push(groupMatrixIndices);
  }

  // 2) Reequilíbrio: se ainda houver rotas com KM muito diferente entre si, tenta mover
  //    o bairro (grupo inteiro) da rota mais carregada para a mais vazia — mas só efetiva
  //    a troca se isso realmente reduzir a diferença entre elas. Bairros nunca são
  //    divididos: ou o bairro inteiro muda de rota, ou fica onde está.
  if (safeNumRoutes > 1) {
    const MAX_ITERATIONS = 30;
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const distances = routeGroups.map((_, r) => routeDistance(r));

      // Busca manual do maior/menor — evita o comportamento estranho de
      // Array.indexOf com NaN (indexOf nunca acha NaN, pois usa ===, e NaN
      // nunca é igual a si mesmo — isso faria maxRoute/minRoute virar -1 e
      // quebrar o acesso a routeGroups[-1] logo abaixo).
      let maxRoute = 0, minRoute = 0;
      for (let r = 1; r < distances.length; r++) {
        if (!(distances[r] <= distances[maxRoute])) maxRoute = r; // trata NaN como "maior"
        if (distances[r] < distances[minRoute]) minRoute = r;
      }

      if (maxRoute === minRoute || routeGroups[maxRoute].length <= 1) break;

      const currentGap = distances[maxRoute] - distances[minRoute];

      // Testa mover cada bairro da rota mais carregada para a mais vazia,
      // e fica com a opção que resultar no menor gap entre as duas rotas.
      let bestGroupIdx = -1;
      let bestGap = currentGap;

      for (let g = 0; g < routeGroups[maxRoute].length; g++) {
        const group = routeGroups[maxRoute][g];
        const newMaxFlat = routeGroups[maxRoute].filter((_, idx) => idx !== g).flat();
        const newMinFlat = [...routeGroups[minRoute].flat(), ...group];

        const newMaxDist = newMaxFlat.length > 0
          ? calculateRouteTotalDistance(orderStopsByNearestNeighbor(newMaxFlat, originIndex, distanceMatrix), originIndex, distanceMatrix)
          : 0;
        const newMinDist = calculateRouteTotalDistance(orderStopsByNearestNeighbor(newMinFlat, originIndex, distanceMatrix), originIndex, distanceMatrix);

        const newGap = Math.abs(newMaxDist - newMinDist);
        if (newGap < bestGap) {
          bestGap = newGap;
          bestGroupIdx = g;
        }
      }

      if (bestGroupIdx === -1) break; // nenhuma troca melhora o equilíbrio — para por aqui

      const [moved] = routeGroups[maxRoute].splice(bestGroupIdx, 1);
      routeGroups[minRoute].push(moved);
    }
  }

  // 3) Ordenar paradas dentro de cada rota usando vizinho mais próximo
  const clusters = routeGroups.map(groups => {
    const flat = groups.flat();
    if (flat.length === 0) return flat;
    const nearestNeighborOrder = orderStopsByNearestNeighbor(flat, originIndex, distanceMatrix);
    // Segunda passada: tenta melhorar a ordem já montada, corrigindo os casos em
    // que o vizinho mais próximo "esqueceu" uma parada no caminho e precisou voltar.
    return twoOptImprove(nearestNeighborOrder, originIndex, distanceMatrix);
  });

  // Converter de índice de matriz de volta para índice de ordersToProcess (0-based)
  return clusters.map(cluster => cluster.map(matrixIdx => matrixIdx - 1));
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

export async function recalculateAndSaveRouteDistances(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  routeId: number
) {
  if (!googleMapsClient.isConfigured()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Google Maps API não configurada. Configure GOOGLE_MAPS_API_KEY.",
    });
  }

  // Buscar dados da rota
  const route = await db.select()
    .from(deliveryRoutes)
    .where(eq(deliveryRoutes.id, routeId))
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
    .where(and(eq(routeOrders.routeId, routeId), ne(orders.status, "cancelled")))
    .orderBy(asc(routeOrders.position));

  if (routeOrderRows.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Rota sem pedidos." });
  }

  // Limpeza: remove da rota qualquer pedido que já tenha sido cancelado
  // (pode acontecer de vínculos antigos terem ficado presos antes desta correção).
  const cancelledInRoute = await db.select({ orderId: routeOrders.orderId })
    .from(routeOrders)
    .leftJoin(orders, eq(routeOrders.orderId, orders.id))
    .where(and(eq(routeOrders.routeId, routeId), eq(orders.status, "cancelled")));

  if (cancelledInRoute.length > 0) {
    await db.delete(routeOrders).where(and(
      eq(routeOrders.routeId, routeId),
      inArray(routeOrders.orderId, cancelledInRoute.map(c => c.orderId))
    ));
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
    // Mesma regra da geração: o endereço da ENTREGA do pedido sempre vale.
    const { text: addr, source } = resolveAddress(row);

    let coords = await googleMapsClient.geocode(addr);

    // Só recorre ao bairro do cadastro quando o endereço usado É o do cadastro.
    if (!coords && source === "cadastro" && row.customerNeighborhood) {
      const fallback = NEIGHBORHOOD_COORDS[normalizeNeighborhood(row.customerNeighborhood)] ?? NEIGHBORHOOD_COORDS[row.customerNeighborhood.toLowerCase().trim()];
      if (fallback) coords = { latitude: fallback.lat, longitude: fallback.lng };
    }

    if (!coords) {
      // Posição fixa (centro da cidade) — sem sorteio, pra o resultado não variar a cada cálculo.
      coords = { latitude: -18.9186, longitude: -48.2772 };
    }

    points.push(coords);
    orderDetails.push(row);
  }

  // Calcular matriz de distância (com fallback euclidiano se a API do Google falhar)
  console.log(`[RecalcularDistâncias] Calculando matriz para ${points.length} pontos...`);
  let distanceMatrix = await calculateDistanceMatrix(points);
  let usedFallback = false;

  if (!distanceMatrix) {
    usedFallback = true;
    console.warn("[RecalcularDistâncias] Falha ao calcular matriz via Google. Usando fallback euclidiano.");
    const n = points.length;
    distanceMatrix = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => {
        if (i === j) return 0;
        return Math.round(
          Math.sqrt(
            Math.pow(points[i].latitude - points[j].latitude, 2) +
            Math.pow(points[i].longitude - points[j].longitude, 2)
          ) * 111000
        );
      })
    );
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
    .where(eq(deliveryRoutes.id, routeId));

  console.log(`[RecalcularDistâncias] Rota #${routeId}: ${(totalDistance / 1000).toFixed(1)} km ${usedFallback ? "(aproximado)" : "reais"}.`);

  return {
    success: true,
    totalDistance: (totalDistance / 1000).toFixed(2),
    message: usedFallback
      ? `Distâncias recalculadas! Total: ${(totalDistance / 1000).toFixed(1)} km (estimativa aproximada — a API de mapas não respondeu no momento).`
      : `Distâncias recalculadas com sucesso! Total: ${(totalDistance / 1000).toFixed(1)} km reais de estrada.`,
  };
}

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
        inArray(orders.status, ["received", "production", "packaged"]),
        gte(orders.createdAt, dateFromObj),
        lte(orders.createdAt, dateToObj),
        eq(customers.isInternal, false),
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
      numRoutes: z.number().int().min(1),
      startingAddress: z.string(),
      routeNamePrefix: z.string().default("Rota"),
      // balanced = equilibra KM + nº de entregas (padrão) | km = só KM | neighborhoods = bairro inteiro numa rota só (modo antigo)
      strategy: z.enum(["balanced", "km", "neighborhoods"]).default("balanced"),
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
      const warnings: string[] = [];

      // 2. Localiza a origem e cada pedido. REGRA: o endereço da ENTREGA do pedido
      // sempre vale; o do cadastro do cliente só é usado quando o pedido não tem um.
      // E o bairro usado pra agrupar é o do endereço realmente usado (via Google).
      console.log(`[Roteirização] Localizando ${ordersToProcess.length} pedidos (estratégia: ${input.strategy})...`);
      const CITY_CENTER = { latitude: -18.9186, longitude: -48.2772 };
      const originCoords = (await googleMapsClient.geocode(input.startingAddress)) || CITY_CENTER;

      if (!googleMapsClient.isConfigured()) {
        warnings.push("O Google Maps não está configurado neste ambiente — as posições foram estimadas pelo bairro e os KM são aproximados.");
      }

      await Promise.all(ordersToProcess.map(async (o) => {
        const { text, source } = resolveAddress(o);
        o.addressUsed = text;
        o.addressSource = source;

        const geo = await googleMapsClient.geocodeDetailed(text);
        if (geo) {
          o.latitude = geo.latitude;
          o.longitude = geo.longitude;
          // Sem bairro no resultado do Google: só recorre ao do cadastro se o endereço usado FOR o do cadastro.
          o.groupNeighborhood = geo.neighborhood ?? (source === "cadastro" ? o.customerNeighborhood : null);
          o.locationQuality = geo.approximate ? "aproximado" : "ok";
          return;
        }

        // Não localizou: tenta a posição aproximada do bairro — mas só se o endereço
        // usado é o do cadastro (se for um endereço de entrega próprio, o bairro do
        // cadastro não diz nada sobre ele).
        const approx = source === "cadastro" && o.customerNeighborhood
          ? NEIGHBORHOOD_COORDS[normalizeNeighborhood(o.customerNeighborhood)] ?? NEIGHBORHOOD_COORDS[o.customerNeighborhood.toLowerCase().trim()]
          : undefined;
        if (approx) {
          o.latitude = approx.lat;
          o.longitude = approx.lng;
          o.groupNeighborhood = o.customerNeighborhood;
          o.locationQuality = "aproximado";
        } else {
          // Posição fixa (centro) — sem sorteio, pra o resultado ser sempre o mesmo.
          o.latitude = CITY_CENTER.latitude;
          o.longitude = CITY_CENTER.longitude;
          o.groupNeighborhood = source === "cadastro" ? o.customerNeighborhood : null;
          o.locationQuality = "falhou";
        }
      }));

      for (const o of ordersToProcess) {
        const label = `Pedido #${o.id} (${o.customerName ?? "sem nome"})`;
        if (o.locationQuality === "falhou") {
          warnings.push(`${label}: não consegui localizar "${o.addressUsed}" — usei o centro da cidade, então essa parada pode ficar na rota errada. Confira o endereço do pedido.`);
        } else if (o.locationQuality === "aproximado") {
          warnings.push(`${label}: endereço localizado só de forma aproximada ("${o.addressUsed}") — confira se está completo.`);
        }
      }

      // Construir lista de todos os pontos (origem + pedidos)
      const allPoints: { latitude: number; longitude: number }[] = [
        originCoords,
        ...ordersToProcess.map(o => ({ latitude: o.latitude!, longitude: o.longitude! })),
      ];

      // 3. Calcular matriz de distância real via Distance Matrix API
      let distanceMatrix: number[][] | null = null;
      let useDistanceMatrix = false;

      if (googleMapsClient.isConfigured()) {
        console.log(`[Roteirização] Calculando matriz de distância real (${allPoints.length} pontos)...`);
        distanceMatrix = await calculateDistanceMatrix(allPoints);

        if (distanceMatrix) {
          useDistanceMatrix = true;
        } else {
          warnings.push("Não consegui as distâncias reais de estrada no Google — usei distância em linha reta, então os KM são aproximados.");
        }
      }

      // 4. Dividir as paradas entre as rotas
      let matrixForClustering: number[][];
      if (useDistanceMatrix && distanceMatrix) {
        matrixForClustering = distanceMatrix;
      } else {
        const n = allPoints.length;
        matrixForClustering = Array.from({ length: n }, (_, i) =>
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
      }

      let routeClusters: number[][];
      let routeMetrics: { totalDistanceMeters: number; visits: { shipmentIndex: number; distanceMeters: number }[] }[];
      const originIdx = 0; // origem é sempre o índice 0 na matriz

      try {
        if (input.strategy === "neighborhoods") {
          // Modo antigo: bairro inteiro numa rota só.
          routeClusters = balanceRoutesByNeighborhood(ordersToProcess, originIdx, matrixForClustering, numRoutes);
        } else {
          // Bairros iguais (mesmo com pequenos erros de digitação) recebem a mesma chave.
          const neighborhoodKeys: string[] = Array(ordersToProcess.length).fill("");
          groupOrderIndicesByNeighborhood(ordersToProcess).forEach((group, gi) => group.forEach(i => { neighborhoodKeys[i] = `g${gi}`; }));
          routeClusters = planRoutes({
            neighborhoodKeys, originIndex: originIdx, matrix: matrixForClustering, numRoutes, strategy: input.strategy,
          });
        }

        const safeMatrixRead = (i: number, j: number): number => {
          const v = matrixForClustering?.[i]?.[j];
          return typeof v === "number" && Number.isFinite(v) ? v : 0;
        };

        routeMetrics = routeClusters.map((cluster) => {
          let totalDist = 0;
          // cluster contém índices de ordersToProcess (0-based); na matriz de
          // distância a origem ocupa o índice 0, então o pedido i está no índice i+1.
          const visits = cluster.map((orderIdx, i) => {
            const distFromPrev = i === 0
              ? safeMatrixRead(originIdx, orderIdx + 1)
              : safeMatrixRead(cluster[i - 1] + 1, orderIdx + 1);
            totalDist += distFromPrev;
            return { shipmentIndex: orderIdx, distanceMeters: distFromPrev };
          });
          if (cluster.length > 0) totalDist += safeMatrixRead(cluster[cluster.length - 1] + 1, originIdx);
          return { totalDistanceMeters: Math.round(totalDist), visits };
        });
      } catch (err) {
        // Registra o erro completo (com stack) nos logs do servidor, em vez de só a
        // mensagem genérica que chega no navegador.
        console.error("[Roteirização] Falha ao agrupar/calcular rotas:", err);
        console.error("[Roteirização] Stack trace:", err instanceof Error ? err.stack : String(err));
        console.error("[Roteirização] Contexto: numOrders=", ordersToProcess.length, "numRoutes=", numRoutes, "matrixSize=", matrixForClustering?.length);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível calcular as rotas com os pedidos selecionados. Tente novamente ou reduza a quantidade de pedidos.",
        });
      }

      // 5. Salva as rotas no banco
      const createdRouteIds: number[] = [];
      const now = new Date();
      const routesSummary: { routeId: number; name: string; stops: number; km: number; neighborhoods: string[] }[] = [];
      const routeNameByOrderId = new Map<number, string>();

      for (let i = 0; i < routeClusters.length; i++) {
        const cluster = routeClusters[i];
        if (cluster.length === 0) continue;

        const ordersInRoute = cluster.map((idx) => ordersToProcess[idx]);
        const metrics = routeMetrics[i];
        const totalDistance = metrics.totalDistanceMeters / 1000;
        const routeName = `${input.routeNamePrefix} #${i + 1}`;

        const [newRoute] = await db.insert(deliveryRoutes).values({
          name: routeName,
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
          routeNameByOrderId.set(order.id, routeName);

          await db.insert(routeOrders).values({
            routeId,
            orderId: order.id,
            position: j + 1,
            distanceFromPrevious: distFromPrev.toFixed(2),
          });

          // O status do pedido só vira "Em Rota" quando a rota for de fato iniciada
          // (entregador sair para entrega) — não na criação da rota.
        }

        routesSummary.push({
          routeId, name: routeName, stops: ordersInRoute.length, km: Math.round(totalDistance * 10) / 10,
          neighborhoods: Array.from(new Set(ordersInRoute.map(o => o.groupNeighborhood).filter((b): b is string => !!b))),
        });
      }

      // Logar resumo das rotas criadas
      console.log(`[Roteirização] === Resumo das Rotas (${input.strategy}) ===`);
      for (const r of routesSummary) console.log(`[Roteirização] ${r.name}: ${r.stops} paradas, ${r.km} km`);

      const strategyLabel = input.strategy === "balanced" ? "KM e nº de entregas equilibrados"
        : input.strategy === "km" ? "KM equilibrado"
        : "bairros inteiros juntos";

      return {
        totalRoutes: createdRouteIds.length,
        totalOrders: input.selectedOrderIds.length,
        routeIds: createdRouteIds,
        strategy: input.strategy,
        message: `${createdRouteIds.length} rota(s) criada(s) — ${strategyLabel}${useDistanceMatrix ? ", com distância real de estrada" : ""}`,
        routes: routesSummary,
        warnings,
        // Relatório de cada parada: de onde veio o endereço usado, em que bairro foi agrupada e em que rota ficou.
        stops: ordersToProcess.map(o => ({
          orderId: o.id,
          customerName: o.customerName ?? "—",
          address: o.addressUsed ?? "",
          addressSource: o.addressSource ?? "cadastro",
          neighborhood: o.groupNeighborhood ?? null,
          quality: o.locationQuality ?? "ok",
          routeName: routeNameByOrderId.get(o.id) ?? "—",
        })),
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
      return recalculateAndSaveRouteDistances(db, input.routeId);
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
