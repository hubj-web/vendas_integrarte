/**
 * Divisão de entregas em rotas — funções puras (sem banco, sem Google), pra
 * poderem ser testadas isoladamente.
 *
 * Convenção de índices: `matrix` tem a origem no índice 0 e a parada `i`
 * (0-based, na lista de pedidos) no índice `i + 1`. As funções daqui
 * trabalham com índices de MATRIZ e só `planRoutes` converte de volta.
 */

export type RouteStrategy = "balanced" | "km" | "neighborhoods";

/** Ordena paradas pelo vizinho mais próximo, partindo da origem. */
export function orderStopsByNearestNeighbor(stops: number[], originIndex: number, matrix: number[][]): number[] {
  if (stops.length <= 1) return stops;
  const remaining = [...stops];
  const ordered: number[] = [];
  let current = originIndex;
  while (remaining.length > 0) {
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const raw = matrix?.[current]?.[remaining[i]];
      const d = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
      if (d < nearestDist) { nearestDist = d; nearest = i; }
    }
    const chosen = remaining.splice(nearest, 1)[0];
    ordered.push(chosen);
    current = chosen;
  }
  return ordered;
}

/**
 * Distância do percurso: origem → paradas (na ordem dada). Em metros.
 * O entregador TERMINA na última entrega e não volta à origem, então a volta não é somada.
 */
export function calculateRouteTotalDistance(ordered: number[], originIndex: number, matrix: number[][]): number {
  if (ordered.length === 0) return 0;
  const d = (i: number, j: number) => {
    const v = matrix?.[i]?.[j];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  let total = d(originIndex, ordered[0]);
  for (let i = 1; i < ordered.length; i++) total += d(ordered[i - 1], ordered[i]);
  return total;
}

/** Melhora a ordem de uma rota invertendo trechos enquanto isso reduzir o KM (2-opt). */
export function twoOptImprove(route: number[], originIndex: number, matrix: number[][]): number[] {
  if (route.length < 3) return route;
  let best = [...route];
  let bestDistance = calculateRouteTotalDistance(best, originIndex, matrix);
  let improved = true;
  let passes = 0;
  while (improved && passes < 40) {
    improved = false;
    passes++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const dist = calculateRouteTotalDistance(candidate, originIndex, matrix);
        if (dist < bestDistance - 0.01) { best = candidate; bestDistance = dist; improved = true; }
      }
    }
  }
  return best;
}

// Até este nº de paradas a ordem de visita é calculada de forma EXATA (programação
// dinâmica de Held-Karp): garante o menor percurso possível pra matriz de distâncias.
// Acima disso cai pra heurística (vizinho mais próximo + 2-opt).
const EXACT_ORDER_LIMIT = 15;

/** Menor percurso (origem → paradas, terminando na última entrega), exato. */
function exactBestOrder(stops: number[], originIndex: number, matrix: number[][]): number[] {
  const n = stops.length;
  const d = (a: number, b: number) => {
    const v = matrix?.[a]?.[b];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  const dOrigin = stops.map(s => d(originIndex, s));
  const dd = stops.map(a => stops.map(b => d(a, b)));

  const FULL = (1 << n) - 1;
  const dp = new Float64Array((FULL + 1) * n).fill(Infinity);
  const parent = new Int8Array((FULL + 1) * n).fill(-1);
  for (let i = 0; i < n; i++) dp[(1 << i) * n + i] = dOrigin[i];

  for (let mask = 1; mask <= FULL; mask++) {
    for (let last = 0; last < n; last++) {
      if (!(mask & (1 << last))) continue;
      const cur = dp[mask * n + last];
      if (cur === Infinity) continue;
      for (let next = 0; next < n; next++) {
        if (mask & (1 << next)) continue;
        const nm = mask | (1 << next);
        const cand = cur + dd[last][next];
        if (cand < dp[nm * n + next]) {
          dp[nm * n + next] = cand;
          parent[nm * n + next] = last;
        }
      }
    }
  }

  let bestLast = 0;
  let bestTotal = Infinity;
  for (let last = 0; last < n; last++) {
    const total = dp[FULL * n + last];
    if (total < bestTotal) { bestTotal = total; bestLast = last; }
  }

  const order: number[] = [];
  let mask = FULL;
  let last = bestLast;
  while (last !== -1) {
    order.push(stops[last]);
    const prev = parent[mask * n + last];
    mask &= ~(1 << last);
    last = prev;
  }
  return order.reverse();
}

/**
 * Ordem de visita de uma rota: parte da origem e termina na última entrega (sem volta).
 * Até 15 paradas: a MELHOR ordem possível (exata). Acima: vizinho mais próximo + 2-opt.
 */
export function optimizeVisitOrder(stops: number[], originIndex: number, matrix: number[][]): number[] {
  if (stops.length <= 1) return [...stops];
  if (stops.length > EXACT_ORDER_LIMIT) {
    return twoOptImprove(orderStopsByNearestNeighbor(stops, originIndex, matrix), originIndex, matrix);
  }
  return exactBestOrder(stops, originIndex, matrix);
}

// Quanto custa, na pontuação, cada km a mais somado em TODAS as rotas (contra 1 km-eq
// a menos na rota mais pesada). Calibrado por simulação: 0,35 aproveita a maior parte
// do ganho de equilíbrio (~12% na rota mais pesada) com ~7% de KM extra em média.
const TOTAL_KM_WEIGHT = 0.35;

// Quanto cada parada "pesa" no esforço da rota, em km equivalentes (cada
// parada custa tempo de estacionar, tocar, entregar, receber...). Com isso, uma
// rota com 14 paradas coladas e uma com 6 paradas espalhadas deixam de parecer
// "iguais" só porque rodam o mesmo KM.
const STOP_COST_KM: Record<RouteStrategy, number> = { balanced: 2, km: 0, neighborhoods: 0 };
// Custo (km equivalentes) de um bairro ficar dividido em mais uma rota — o
// "freio" que mantém o bairro junto, a menos que dividir melhore bastante o equilíbrio.
const SPLIT_COST_KM: Record<RouteStrategy, number> = { balanced: 3, km: 0.5, neighborhoods: 0 };

/**
 * Divide as paradas em `numRoutes` rotas equilibradas.
 *
 * 1) Parte de uma divisão por bairro (bairro inteiro vai pra uma rota só).
 * 2) Melhora por busca local: testa mover uma parada, ou trocar duas paradas
 *    entre rotas, e só aceita a mudança se reduzir o desequilíbrio de esforço
 *    (KM + peso das paradas) somado ao custo de dividir bairros.
 *
 * `neighborhoodKeys[i]` = bairro (já normalizado) da parada i; vazio = sem bairro.
 * Retorna, por rota, os índices 0-based das paradas, já em ordem de visita.
 */
export function planRoutes(opts: {
  neighborhoodKeys: string[];
  originIndex: number;
  matrix: number[][];
  numRoutes: number;
  strategy: RouteStrategy;
}): number[][] {
  const { neighborhoodKeys, originIndex, matrix, strategy } = opts;
  const n = neighborhoodKeys.length;
  const numRoutes = Math.max(1, Math.min(Math.floor(opts.numRoutes) || 1, n || 1));
  const stopCost = STOP_COST_KM[strategy];
  const splitCost = SPLIT_COST_KM[strategy];

  // rotas = listas de índices de MATRIZ (i + 1)
  const routes: number[][] = Array.from({ length: numRoutes }, () => []);

  const workload = (stops: number[]): number => {
    if (stops.length === 0) return 0;
    const ordered = orderStopsByNearestNeighbor(stops, originIndex, matrix);
    return calculateRouteTotalDistance(ordered, originIndex, matrix) / 1000 + stopCost * stops.length;
  };

  // 1) Atribuição inicial: bairros maiores primeiro, cada bairro inteiro vai
  //    pra rota que ficar com menor esforço depois de recebê-lo.
  const groups = new Map<string, number[]>();
  neighborhoodKeys.forEach((key, i) => {
    const k = key || `__sem_bairro_${i}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(i + 1);
  });
  const sortedGroups = Array.from(groups.values()).sort((a, b) => b.length - a.length);
  for (const group of sortedGroups) {
    let best = 0;
    let bestLoad = Infinity;
    for (let r = 0; r < numRoutes; r++) {
      const load = workload([...routes[r], ...group]);
      if (load < bestLoad) { bestLoad = load; best = r; }
    }
    routes[best].push(...group);
  }

  if (strategy !== "neighborhoods" && numRoutes > 1) {
    const keyOfMatrixIdx = (m: number) => neighborhoodKeys[m - 1] || `__sem_bairro_${m - 1}`;

    // Quantas rotas diferentes cada bairro ocupa (só importa pra bairros com mais de 1 parada).
    const splitsOf = (rs: number[][]): number => {
      const where = new Map<string, Set<number>>();
      rs.forEach((stops, r) => stops.forEach(m => {
        const k = keyOfMatrixIdx(m);
        (where.get(k) ?? where.set(k, new Set()).get(k)!).add(r);
      }));
      let extra = 0;
      where.forEach(set => { if (set.size > 1) extra += set.size - 1; });
      return extra;
    };

    // Quanto menor, melhor. Pensado pra não "empatar à força" fazendo uma rota
    // leve rodar à toa só pra igualar com a pesada:
    //  - maxLoad: a rota mais pesada é a que atrasa tudo, então é o termo principal;
    //  - KM total: penaliza KM desperdiçado (desvios que só aumentam o total);
    //  - desvio: desempata a favor de rotas parecidas, com peso baixo o bastante
    //    pra nunca compensar um desvio inútil só pra igualar;
    //  - bairro dividido: o "freio" que mantém o bairro junto.
    const score = (rs: number[][], loads: number[]): number => {
      const sum = loads.reduce((a, b) => a + b, 0);
      const mean = sum / loads.length;
      const maxLoad = Math.max(...loads);
      const deviation = loads.reduce((a, l) => a + Math.abs(l - mean), 0);
      return maxLoad + TOTAL_KM_WEIGHT * sum + 0.2 * deviation + splitCost * splitsOf(rs);
    };

    let loads = routes.map(workload);
    let currentScore = score(routes, loads);

    for (let iter = 0; iter < 300; iter++) {
      let bestScore = currentScore - 1e-6;
      let bestMove: { type: "move" | "swap"; r1: number; i1: number; r2: number; i2?: number } | null = null;

      for (let r1 = 0; r1 < numRoutes; r1++) {
        for (let i1 = 0; i1 < routes[r1].length; i1++) {
          for (let r2 = 0; r2 < numRoutes; r2++) {
            if (r2 === r1) continue;

            // Mover a parada i1 de r1 para r2
            if (routes[r1].length > 1) {
              const nr1 = routes[r1].filter((_, k) => k !== i1);
              const nr2 = [...routes[r2], routes[r1][i1]];
              const trial = routes.map((s, k) => (k === r1 ? nr1 : k === r2 ? nr2 : s));
              const trialLoads = loads.map((l, k) => (k === r1 ? workload(nr1) : k === r2 ? workload(nr2) : l));
              const s = score(trial, trialLoads);
              if (s < bestScore) { bestScore = s; bestMove = { type: "move", r1, i1, r2 }; }
            }

            // Trocar a parada i1 de r1 com cada parada i2 de r2
            for (let i2 = 0; i2 < routes[r2].length; i2++) {
              const nr1 = routes[r1].map((m, k) => (k === i1 ? routes[r2][i2] : m));
              const nr2 = routes[r2].map((m, k) => (k === i2 ? routes[r1][i1] : m));
              const trial = routes.map((s, k) => (k === r1 ? nr1 : k === r2 ? nr2 : s));
              const trialLoads = loads.map((l, k) => (k === r1 ? workload(nr1) : k === r2 ? workload(nr2) : l));
              const s = score(trial, trialLoads);
              if (s < bestScore) { bestScore = s; bestMove = { type: "swap", r1, i1, r2, i2 }; }
            }
          }
        }
      }

      if (!bestMove) break;
      const { type, r1, i1, r2 } = bestMove;
      if (type === "move") {
        const [m] = routes[r1].splice(i1, 1);
        routes[r2].push(m);
      } else {
        const i2 = bestMove.i2!;
        const tmp = routes[r1][i1];
        routes[r1][i1] = routes[r2][i2];
        routes[r2][i2] = tmp;
      }
      loads = routes.map(workload);
      currentScore = bestScore;
    }
  }

  // Ordem final de visita em cada rota: a melhor possível (exata até 15 paradas)
  return routes.map(stops => optimizeVisitOrder(stops, originIndex, matrix).map(m => m - 1));
}
