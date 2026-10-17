import { describe, expect, it } from "vitest";
import { calculateRouteTotalDistance, optimizeVisitOrder, orderStopsByNearestNeighbor, planRoutes, twoOptImprove, type RouteStrategy } from "./routeBalancing";

// Gerador pseudo-aleatório determinístico (pro teste não variar entre execuções)
function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

/**
 * Cenário parecido com o caso real: 1 bairro grande (14 entregas) e 2 bairros
 * menores (6 cada). `bigSpread` controla o quanto o bairro grande é espalhado.
 * Índice 0 da matriz = origem; distâncias euclidianas em metros.
 */
function scenario(seed: number, bigSpread: number) {
  const rand = rng(seed);
  const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  const keys: string[] = [];
  const add = (count: number, cx: number, cy: number, sx: number, sy: number, key: string) => {
    for (let i = 0; i < count; i++) {
      pts.push({ x: cx + (rand() - 0.5) * sx, y: cy + (rand() - 0.5) * sy });
      keys.push(key);
    }
  };
  add(14, 3000, 0, bigSpread, bigSpread, "grande");
  add(6, -3000, 3000, 3000, 3000, "b");
  add(6, -3000, -3000, 3000, 3000, "c");
  const matrix = pts.map(a => pts.map(b => Math.round(Math.hypot(a.x - b.x, a.y - b.y))));
  return { keys, matrix };
}

const STOP_COST = 2; // mesmo peso do modo "balanced"

const metrics = (routes: number[][], matrix: number[][]) =>
  routes.map(r => {
    const km = calculateRouteTotalDistance(orderStopsByNearestNeighbor(r.map(i => i + 1), 0, matrix), 0, matrix) / 1000;
    return { stops: r.length, km, load: km + STOP_COST * r.length };
  });

const run = (strategy: RouteStrategy, keys: string[], matrix: number[][], numRoutes = 3) =>
  planRoutes({ neighborhoodKeys: keys, originIndex: 0, matrix, numRoutes, strategy });

describe("planRoutes", () => {
  it("modo antigo (bairros inteiros) mantém o bairro grande numa rota só — reproduz o 14/6/6 que o Diego viu", () => {
    for (const seed of [1, 2, 3]) {
      const { keys, matrix } = scenario(seed, 2500);
      expect(run("neighborhoods", keys, matrix).map(r => r.length).sort((a, b) => a - b)).toEqual([6, 6, 14]);
    }
  });

  it("modo equilibrado divide o bairro grande e espalhado na maioria dos casos (só mantém junto quando dividir não compensa)", () => {
    let divided = 0;
    let total = 0;
    for (const seed of [1, 2, 3]) {
      for (const spread of [2500, 4000]) {
        const { keys, matrix } = scenario(seed, spread);
        const stops = run("balanced", keys, matrix).map(r => r.length);
        expect(stops.reduce((a, b) => a + b, 0)).toBe(26);
        total++;
        if (Math.max(...stops) < 14) divided++;
      }
    }
    expect(divided).toBeGreaterThanOrEqual(total - 1);
  });

  it("modo equilibrado nunca deixa a rota mais pesada pior que o modo antigo", () => {
    for (const seed of [1, 2, 3]) {
      for (const spread of [800, 2500, 4000]) {
        const { keys, matrix } = scenario(seed, spread);
        const maxOld = Math.max(...metrics(run("neighborhoods", keys, matrix), matrix).map(m => m.load));
        const maxNew = Math.max(...metrics(run("balanced", keys, matrix), matrix).map(m => m.load));
        expect(maxNew).toBeLessThanOrEqual(maxOld + 0.01);
      }
    }
  });

  it("modo equilibrado não gera KM desperdiçado (total não passa de 35% acima do modo antigo)", () => {
    for (const seed of [1, 2, 3]) {
      for (const spread of [800, 2500, 4000]) {
        const { keys, matrix } = scenario(seed, spread);
        const totalOld = metrics(run("neighborhoods", keys, matrix), matrix).reduce((a, m) => a + m.km, 0);
        const totalNew = metrics(run("balanced", keys, matrix), matrix).reduce((a, m) => a + m.km, 0);
        expect(totalNew).toBeLessThanOrEqual(totalOld * 1.35);
      }
    }
  });

  it("todas as paradas aparecem exatamente uma vez, em qualquer modo", () => {
    const { keys, matrix } = scenario(1, 2500);
    for (const strategy of ["balanced", "km", "neighborhoods"] as const) {
      const all = run(strategy, keys, matrix).flat().sort((a, b) => a - b);
      expect(all).toEqual(Array.from({ length: 26 }, (_, i) => i));
    }
  });

  it("não quebra com 1 rota, mais rotas que paradas, ou lista vazia", () => {
    const { keys, matrix } = scenario(1, 2500);
    expect(run("balanced", keys, matrix, 1)[0]).toHaveLength(26);
    expect(planRoutes({ neighborhoodKeys: ["a", "b"], originIndex: 0, matrix: [[0, 1, 2], [1, 0, 1], [2, 1, 0]], numRoutes: 5, strategy: "balanced" }).flat()).toHaveLength(2);
    expect(planRoutes({ neighborhoodKeys: [], originIndex: 0, matrix: [[0]], numRoutes: 3, strategy: "balanced" }).flat()).toHaveLength(0);
  });
});

// ─── Ordem de visita ────────────────────────────────────────────────────────

/** Todas as permutações (só pra n pequeno, é a "resposta certa" por força bruta). */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(p => [x, ...p]));
}

function randomMatrix(n: number, seed: number, asymmetric: boolean) {
  const rand = rng(seed);
  const pts = Array.from({ length: n + 1 }, () => ({ x: rand() * 10000, y: rand() * 10000 }));
  return pts.map((a, i) => pts.map((b, j) => {
    if (i === j) return 0;
    const base = Math.hypot(a.x - b.x, a.y - b.y);
    // Ruas de mão única: ida e volta não são exatamente iguais
    return Math.round(asymmetric ? base * (1 + 0.15 * rand()) : base);
  }));
}

describe("optimizeVisitOrder", () => {
  it("acha exatamente o menor percurso (confere com força bruta)", () => {
    for (const asymmetric of [false, true]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const n = 7;
        const matrix = randomMatrix(n, seed, asymmetric);
        const stops = Array.from({ length: n }, (_, i) => i + 1);
        const bruteBest = Math.min(...permutations(stops).map(p => calculateRouteTotalDistance(p, 0, matrix)));
        const result = optimizeVisitOrder(stops, 0, matrix);
        const resultLen = calculateRouteTotalDistance(result, 0, matrix);
        expect(resultLen).toBe(bruteBest);
        expect([...result].sort((a, b) => a - b)).toEqual(stops);
      }
    }
  });

  it("nunca é pior que vizinho mais próximo + 2-opt", () => {
    for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) {
      const n = 12;
      const matrix = randomMatrix(n, seed, true);
      const stops = Array.from({ length: n }, (_, i) => i + 1);
      const heuristic = calculateRouteTotalDistance(twoOptImprove(orderStopsByNearestNeighbor(stops, 0, matrix), 0, matrix), 0, matrix);
      const exact = calculateRouteTotalDistance(optimizeVisitOrder(stops, 0, matrix), 0, matrix);
      expect(exact).toBeLessThanOrEqual(heuristic);
    }
  });

  it("em linha reta a partir da base, vai da mais perto para a mais longe e termina na última", () => {
    const xs = [1000, 2000, 3000, 4000, 5000];
    const pts = [0, ...xs];
    const matrix = pts.map(a => pts.map(b => Math.abs(a - b)));
    const order = optimizeVisitOrder([5, 3, 1, 4, 2], 0, matrix);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it("o KM do percurso NÃO soma a volta à base (o entregador termina na última entrega)", () => {
    const matrix = [[0, 1000], [1000, 0]];
    expect(calculateRouteTotalDistance([1], 0, matrix)).toBe(1000);
  });

  it("sem volta, a melhor ordem pode ser diferente da que voltaria à base", () => {
    // Base no meio de uma linha: A a +10, B a +20, C a -100.
    // Sem volta: A → B → C (10 + 10 + 120 = 140) termina no lado distante.
    // (Com volta, terminar perto da base também compensaria; aqui o percurso aberto escolhe A,B,C.)
    const pts = [0, 10, 20, -100];
    const matrix = pts.map(a => pts.map(b => Math.abs(a - b)));
    const order = optimizeVisitOrder([1, 2, 3], 0, matrix);
    expect(calculateRouteTotalDistance(order, 0, matrix)).toBe(140);
  });

  it("funciona com 16+ paradas (cai na heurística) e com 0/1 parada", () => {
    const n = 18;
    const matrix = randomMatrix(n, 7, false);
    const stops = Array.from({ length: n }, (_, i) => i + 1);
    expect([...optimizeVisitOrder(stops, 0, matrix)].sort((a, b) => a - b)).toEqual(stops);
    expect(optimizeVisitOrder([], 0, [[0]])).toEqual([]);
    expect(optimizeVisitOrder([1], 0, [[0, 5], [5, 0]])).toEqual([1]);
  });

  it("15 paradas exatas rodam rápido (< 2 s)", () => {
    const n = 15;
    const matrix = randomMatrix(n, 9, true);
    const stops = Array.from({ length: n }, (_, i) => i + 1);
    const t0 = Date.now();
    optimizeVisitOrder(stops, 0, matrix);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
