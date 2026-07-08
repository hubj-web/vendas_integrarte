import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc, inArray, gte, lte } from "drizzle-orm";
import { z } from "zod";
import {
  deliveryRoutes, routeOrders, orders, customers, users, deliveryMethods,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

/**
 * Algoritmo de otimização de rotas baseado em distância.
 * Distribui pedidos entre entregadores de forma equilibrada,
 * minimizando a distância total percorrida por cada um.
 */

interface OrderWithLocation {
  id: number;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  customerStreet: string;
  customerNumber: string;
  customerNeighborhood: string;
  customerCity: string;
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

/**
 * Calcula distância aproximada entre dois pontos usando fórmula de Haversine.
 * Se coordenadas não estão disponíveis, usa estimativa baseada em bairro.
 */
function calculateDistance(
  lat1: number | undefined,
  lon1: number | undefined,
  lat2: number | undefined,
  lon2: number | undefined,
  neighborhood1: string,
  neighborhood2: string
): number {
  // Se ambos têm coordenadas, usa Haversine
  if (lat1 !== undefined && lon1 !== undefined && lat2 !== undefined && lon2 !== undefined) {
    const R = 6371; // Raio da Terra em km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Fallback: se bairros são iguais, distância pequena; caso contrário, média
  if (neighborhood1 === neighborhood2) {
    return 1; // 1 km dentro do mesmo bairro
  }
  return 5; // 5 km entre bairros diferentes (estimativa)
}

/**
 * Algoritmo guloso para distribuir pedidos entre entregadores.
 * Sempre atribui o próximo pedido ao entregador com menor distância acumulada.
 */
function optimizeRoutesByDistance(
  orders: OrderWithLocation[],
  deliveryUsers: Array<{ id: number; name: string }>,
  startingAddress: string
): RouteAssignment[] {
  const routes: RouteAssignment[] = deliveryUsers.map(user => ({
    deliveryUserId: user.id,
    deliveryUserName: user.name,
    orders: [],
    estimatedDistance: 0,
  }));

  // Ordena pedidos por bairro para melhor agrupamento
  const sortedOrders = [...orders].sort((a, b) => {
    const aNeighborhood = a.customerNeighborhood || "";
    const bNeighborhood = b.customerNeighborhood || "";
    return aNeighborhood.localeCompare(bNeighborhood);
  });

  // Atribui cada pedido ao entregador com menor distância acumulada
  for (const order of sortedOrders) {
    let minRoute = routes[0];
    let minDistance = Infinity;

    for (const route of routes) {
      // Calcula distância do último ponto da rota até este pedido
      let distanceToAdd = 0;

      if (route.orders.length === 0) {
        // Primeira entrega: distância do ponto de saída até o pedido
        distanceToAdd = calculateDistance(
          undefined,
          undefined,
          order.latitude,
          order.longitude,
          startingAddress.split(",")[1] || "",
          order.customerNeighborhood
        );
      } else {
        // Próxima entrega: distância do último ponto até este pedido
        const lastOrder = route.orders[route.orders.length - 1];
        distanceToAdd = calculateDistance(
          lastOrder.latitude,
          lastOrder.longitude,
          order.latitude,
          order.longitude,
          lastOrder.customerNeighborhood,
          order.customerNeighborhood
        );
      }

      const totalDistance = route.estimatedDistance + distanceToAdd;

      if (totalDistance < minDistance) {
        minDistance = totalDistance;
        minRoute = route;
      }
    }

    minRoute.orders.push(order);
    minRoute.estimatedDistance = minDistance;
  }

  // Remove rotas vazias
  return routes.filter(r => r.orders.length > 0);
}

export const routeOptimizationRouter = router({
  /**
   * Gera rotas otimizadas para um período específico.
   * Seleciona todos os pedidos em "production" dentro do período
   * e distribui entre o número de entregadores disponíveis.
   */
  generateOptimizedRoutes: protectedProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
      deliveryUserIds: z.array(z.number()).min(1),
      startingAddress: z.string().default("Rua Eloi da Costa, 145, Luizote de Freitas, Uberlândia, MG"),
      routeNamePrefix: z.string().default("Rota Otimizada"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Busca todos os pedidos em "production" dentro do período
      const dateFromObj = new Date(input.dateFrom);
      const dateToObj = new Date(input.dateTo);
      dateToObj.setHours(23, 59, 59);

      const availableOrders = await db.select({
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

      if (availableOrders.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nenhum pedido disponível no período especificado.",
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

      // Otimiza rotas
      const optimizedRoutes = optimizeRoutesByDistance(
        availableOrders as OrderWithLocation[],
        deliveryUsers,
        input.startingAddress
      );

      // Cria as rotas no banco de dados
      const createdRoutes = [];

      for (const optimizedRoute of optimizedRoutes) {
        const startingAddress = input.startingAddress && input.startingAddress.trim() !== "" 
          ? input.startingAddress 
          : "Rua Eloi da Costa, 145, Luizote de Freitas, Uberlândia, MG";

        const routeResult = await db.insert(deliveryRoutes).values({
          name: `${input.routeNamePrefix} - ${optimizedRoute.deliveryUserName}`,
          deliveryDate: new Date(input.dateFrom),
          deliveryUserId: optimizedRoute.deliveryUserId,
          startingAddress: startingAddress,
          totalDistance: optimizedRoute.estimatedDistance.toString(),
          createdBy: ctx.user.id,
          status: "planned",
        });

        const routeId = Number((routeResult as any).insertId);

        // Insere os pedidos na rota
        for (let i = 0; i < optimizedRoute.orders.length; i++) {
          const order = optimizedRoute.orders[i];
          let distanceFromPrevious = 0;

          if (i === 0) {
            // Primeira entrega
            distanceFromPrevious = calculateDistance(
              undefined,
              undefined,
              order.latitude,
              order.longitude,
              input.startingAddress.split(",")[1] || "",
              order.customerNeighborhood
            );
          } else {
            // Próximas entregas
            const prevOrder = optimizedRoute.orders[i - 1];
            distanceFromPrevious = calculateDistance(
              prevOrder.latitude,
              prevOrder.longitude,
              order.latitude,
              order.longitude,
              prevOrder.customerNeighborhood,
              order.customerNeighborhood
            );
          }

          await db.insert(routeOrders).values({
            routeId,
            orderId: order.id,
            position: i + 1,
            distanceFromPrevious: distanceFromPrevious.toString(),
          });
        }

        // Atualiza status dos pedidos para "in_route"
        await db.update(orders)
          .set({ status: "in_route" })
          .where(inArray(orders.id, optimizedRoute.orders.map(o => o.id)));

        createdRoutes.push({
          routeId,
          deliveryUserId: optimizedRoute.deliveryUserId,
          deliveryUserName: optimizedRoute.deliveryUserName,
          orderCount: optimizedRoute.orders.length,
          estimatedDistance: optimizedRoute.estimatedDistance,
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
   * Lista pedidos disponíveis para roteamento em um período
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
        .orderBy(asc(orders.customerNeighborhood));

      return rows;
    }),

  /**
   * Atualiza o endereço de saída de uma rota
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
});
