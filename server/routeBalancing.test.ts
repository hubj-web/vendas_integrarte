import { describe, expect, it } from "vitest";
import { calculateRouteTotalDistance, orderStopsByNearestNeighbor, planRoutes, type RouteStrategy } from "./routeBalancing";

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

  it("modo equilibrado divide um bairro grande e espalhado, sem rota com as 14 entregas", () => {
    for (const seed of [1, 2, 3]) {
      for (const spread of [2500, 4000]) {
        const { keys, matrix } = scenario(seed, spread);
        const stops = run("balanced", keys, matrix).map(r => r.length);
        expect(stops.reduce((a, b) => a + b, 0)).toBe(26);
        expect(Math.max(...stops)).toBeLessThan(14);
      }
    }
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
