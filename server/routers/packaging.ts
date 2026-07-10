import { TRPCError } from "@trpc/server";
import { eq, asc, inArray, and } from "drizzle-orm";
import { z } from "zod";
import {
  deliveryRoutes, routeOrders, orders, customers, users, deliveryMethods,
  orderItems, orderItemFlavors, products, productFlavors,
  orderMinipizzas, orderMinipizzaFlavors, minipizzaTypes, minipizzaFlavors,
  orderJellies, jellyFlavors, orderStatusHistory,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

// Rotas elegíveis para empacotamento: já criadas (não canceladas/concluídas há muito tempo),
// contendo pelo menos um pedido nos status in_route ou packaged.
export const packagingRouter = router({
  // Lista rotas disponíveis para empacotamento, com contagem de pedidos pendentes/prontos.
  // Filtra opcionalmente por forma de entrega (tipo de entrega a ser preparado).
  routes: adminProcedure
    .input(z.object({ deliveryMethodId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const routeRows = await db.select({
        id: deliveryRoutes.id, name: deliveryRoutes.name,
        deliveryDate: deliveryRoutes.deliveryDate, status: deliveryRoutes.status,
        deliveryUserId: deliveryRoutes.deliveryUserId, deliveryUserName: users.name,
      })
        .from(deliveryRoutes)
        .leftJoin(users, eq(deliveryRoutes.deliveryUserId, users.id))
        .where(inArray(deliveryRoutes.status, ["planned", "in_progress"]))
        .orderBy(asc(deliveryRoutes.deliveryDate));

      if (routeRows.length === 0) return [];

      const routeIds = routeRows.map(r => r.id);
      const orderRows = await db.select({
        routeId: routeOrders.routeId, orderId: routeOrders.orderId,
        status: orders.status, deliveryMethodId: orders.deliveryMethodId,
      })
        .from(routeOrders)
        .leftJoin(orders, eq(routeOrders.orderId, orders.id))
        .where(inArray(routeOrders.routeId, routeIds));

      return routeRows
        .map(route => {
          const relevant = orderRows.filter(o =>
            o.routeId === route.id &&
            (o.status === "in_route" || o.status === "packaged") &&
            (!input?.deliveryMethodId || o.deliveryMethodId === input.deliveryMethodId)
          );
          return {
            ...route,
            totalOrders: relevant.length,
            packagedOrders: relevant.filter(o => o.status === "packaged").length,
          };
        })
        .filter(r => r.totalOrders > 0);
    }),

  // Detalhe de uma rota para empacotamento: pedidos + itens a separar por pedido.
  routeDetail: adminProcedure
    .input(z.object({ routeId: z.number(), deliveryMethodId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [route] = await db.select({
        id: deliveryRoutes.id, name: deliveryRoutes.name,
        deliveryDate: deliveryRoutes.deliveryDate, status: deliveryRoutes.status,
        deliveryUserName: users.name,
      })
        .from(deliveryRoutes)
        .leftJoin(users, eq(deliveryRoutes.deliveryUserId, users.id))
        .where(eq(deliveryRoutes.id, input.routeId));
      if (!route) throw new TRPCError({ code: "NOT_FOUND" });

      const orderRows = await db.select({
        routeOrderId: routeOrders.id, position: routeOrders.position,
        orderId: orders.id, status: orders.status,
        deliveryMethodId: orders.deliveryMethodId, deliveryMethodName: deliveryMethods.name,
        deliveryAddress: orders.deliveryAddress, notes: orders.notes,
        customerName: customers.name, customerPhone: customers.phone,
      })
        .from(routeOrders)
        .leftJoin(orders, eq(routeOrders.orderId, orders.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(
          eq(routeOrders.routeId, input.routeId),
        ))
        .orderBy(asc(routeOrders.position));

      const relevant = orderRows.filter(o =>
        (o.status === "in_route" || o.status === "packaged") &&
        (!input.deliveryMethodId || o.deliveryMethodId === input.deliveryMethodId)
      );
      if (relevant.length === 0) return { route, orders: [] };

      const orderIds = relevant.map(o => o.orderId!);

      // Produtos comuns
      const itemRows = await db.select({
        id: orderItems.id, orderId: orderItems.orderId,
        productName: products.name, unit: products.unit, quantity: orderItems.quantity,
      }).from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));

      const itemIds = itemRows.map(i => i.id);
      const itemFlavorMap: Record<number, string[]> = {};
      if (itemIds.length > 0) {
        const flavorRows = await db.select({
          orderItemId: orderItemFlavors.orderItemId, flavorName: productFlavors.name,
        }).from(orderItemFlavors)
          .leftJoin(productFlavors, eq(orderItemFlavors.productFlavorId, productFlavors.id))
          .where(inArray(orderItemFlavors.orderItemId, itemIds));
        for (const f of flavorRows) {
          (itemFlavorMap[f.orderItemId] ??= []).push(f.flavorName ?? "");
        }
      }

      // Minipizzas
      const mpRows = await db.select({
        id: orderMinipizzas.id, orderId: orderMinipizzas.orderId,
        typeName: minipizzaTypes.name, quantity: orderMinipizzas.quantity,
      }).from(orderMinipizzas)
        .leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
        .where(inArray(orderMinipizzas.orderId, orderIds));

      const mpIds = mpRows.map(m => m.id);
      const mpFlavorMap: Record<number, string[]> = {};
      if (mpIds.length > 0) {
        const flavorRows = await db.select({
          orderMinipizzaId: orderMinipizzaFlavors.orderMinipizzaId, flavorName: minipizzaFlavors.name,
        }).from(orderMinipizzaFlavors)
          .leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
          .where(inArray(orderMinipizzaFlavors.orderMinipizzaId, mpIds));
        for (const f of flavorRows) {
          (mpFlavorMap[f.orderMinipizzaId] ??= []).push(f.flavorName ?? "");
        }
      }

      // Geleias
      const jRows = await db.select({
        orderId: orderJellies.orderId, flavorName: jellyFlavors.name, quantity: orderJellies.quantity,
      }).from(orderJellies)
        .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
        .where(inArray(orderJellies.orderId, orderIds));

      const itemsByOrder: Record<number, { label: string; quantity: number }[]> = {};
      for (const it of itemRows) {
        const flavors = itemFlavorMap[it.id] ?? [];
        const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
        (itemsByOrder[it.orderId] ??= []).push({
          label: `${it.productName}${flavorStr}`, quantity: it.quantity,
        });
      }
      for (const mp of mpRows) {
        const flavors = mpFlavorMap[mp.id] ?? [];
        const flavorStr = flavors.length > 0 ? ` — ${flavors.join(", ")}` : "";
        (itemsByOrder[mp.orderId] ??= []).push({
          label: `Minipizza ${mp.typeName ?? "—"}${flavorStr}`, quantity: mp.quantity,
        });
      }
      for (const j of jRows) {
        (itemsByOrder[j.orderId] ??= []).push({
          label: `Geleia ${j.flavorName}`, quantity: j.quantity,
        });
      }

      const enriched = relevant.map(o => ({
        ...o,
        items: itemsByOrder[o.orderId!] ?? [],
      }));

      return { route, orders: enriched };
    }),

  // Marca (ou desmarca) um pedido como empacotado.
  setPackaged: adminProcedure
    .input(z.object({ orderId: z.number(), packaged: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [current] = await db.select().from(orders).where(eq(orders.id, input.orderId));
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.packaged) {
        if (current.status !== "in_route") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível empacotar pedidos que já estão em uma rota (status 'Em Rota')." });
        }
        await db.update(orders).set({ status: "packaged" }).where(eq(orders.id, input.orderId));
        await db.insert(orderStatusHistory).values({
          orderId: input.orderId, userId: ctx.user.id, fromStatus: current.status, toStatus: "packaged",
        });
      } else {
        if (current.status !== "packaged") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este pedido não está marcado como empacotado." });
        }
        await db.update(orders).set({ status: "in_route" }).where(eq(orders.id, input.orderId));
        await db.insert(orderStatusHistory).values({
          orderId: input.orderId, userId: ctx.user.id, fromStatus: current.status, toStatus: "in_route",
        });
      }

      return { success: true };
    }),
});
