import { TRPCError } from "@trpc/server";
import { eq, desc, and, gte, lte, like, or, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  customers, orders, orderItems, orderItemFlavors, orderMinipizzas, orderMinipizzaFlavors,
  orderJellies, orderStatusHistory, products, productFlavors, minipizzaTypes, minipizzaFlavors,
  jellyFlavors, deliveryMethods, users, deliveryRecords, paymentRecords, routeOrders,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { googleSheets } from "../google-sheets";
import { uploadReceiptToDrive } from "../google-drive";
import { sendOrderNotification } from "../telegram";

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────
const customersAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

const customersRouter = router({
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(customers)
        .where(or(like(customers.name, `%${input.query}%`), like(customers.phone, `%${input.query}%`)))
        .limit(10);
    }),

  list: customersAdminProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().default(25),
      query: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const { page, pageSize, query } = input;
      const where = query
        ? or(like(customers.name, `%${query}%`), like(customers.phone, `%${query}%`))
        : undefined;

      const [items, totalRows] = await Promise.all([
        db.select().from(customers)
          .where(where)
          .orderBy(customers.name)
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ count: sql<number>`count(*)` }).from(customers).where(where),
      ]);

      return { items, total: Number(totalRows[0]?.count ?? 0) };
    }),

  getById: customersAdminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [customer] = await db.select().from(customers).where(eq(customers.id, input.id));
      const [orderCount] = await db.select({ count: sql<number>`count(*)` })
        .from(orders).where(eq(orders.customerId, input.id));
      return customer ? { ...customer, orderCount: Number(orderCount?.count ?? 0) } : null;
    }),

  delete: customersAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [orderCount] = await db.select({ count: sql<number>`count(*)` })
        .from(orders).where(eq(orders.customerId, input.id));
      if (Number(orderCount?.count ?? 0) > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não é possível excluir: este cliente possui pedidos vinculados. Mantenha o cadastro para preservar o histórico.",
        });
      }
      await db.delete(customers).where(eq(customers.id, input.id));
      return { success: true };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      phone: z.string().min(8),
      locationReference: z.string().optional(),
      customerReference: z.string().optional(),
      street: z.string().optional(),
      number: z.string().optional(),
      complement: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      zipCode: z.string().optional(),
      isInternal: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.insert(customers).values(input);
      return { success: true, id: Number((result as any)[0].insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      phone: z.string().optional(),
      locationReference: z.string().optional(),
      customerReference: z.string().optional(),
      street: z.string().optional(),
      number: z.string().optional(),
      complement: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      zipCode: z.string().optional(),
      isInternal: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(customers).set(data).where(eq(customers.id, id));
      return { success: true };
    }),
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────
const orderItemSchema = z.object({
  productId: z.number(),
  quantity: z.number().int().positive(),
  unitPrice: z.string(),
  subtotal: z.string(),
  flavorIds: z.array(z.number()).optional(),
});

const orderMinipizzaSchema = z.object({
  minipizzaTypeId: z.number(),
  flavorIds: z.array(z.number()),
  quantity: z.number().int().positive(),
  unitPrice: z.string(),
  subtotal: z.string(),
});

const orderJellySchema = z.object({
  jellyFlavorId: z.number(),
  quantity: z.number().int().positive(),
  unitPrice: z.string(),
  subtotal: z.string(),
});

export const ordersRouter = router({
  customers: customersRouter,
  list: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().default(25),
      status: z.string().optional(),
      statusIn: z.array(z.string()).optional(),
      paymentStatus: z.string().optional(),
      launcherId: z.number().optional(),
      deliveryMethodId: z.number().optional(),
      routeId: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { data: [], total: 0 };

      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 25;
      const offset = (page - 1) * pageSize;

      const allOrders = await db.select({
        id: orders.id,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        totalAmount: orders.totalAmount,
        paymentMethod: orders.paymentMethod,
        deliveryDate: orders.deliveryDate,
        createdAt: orders.createdAt,
        notes: orders.notes,
        customerId: orders.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        launcherId: orders.launcherId,
        launcherName: users.name,
        deliveryMethodId: orders.deliveryMethodId,
        deliveryMethodName: deliveryMethods.name,
        deliveryAddress: orders.deliveryAddress,
        routeId: routeOrders.routeId,
        routePosition: routeOrders.position,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(users, eq(orders.launcherId, users.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .leftJoin(routeOrders, eq(orders.id, routeOrders.orderId))
        .orderBy(desc(orders.createdAt));

      // Filter
      let filtered = allOrders.filter(o => {
        if (ctx.user.role === "delivery") {
          // Entregadores só veem pedidos em rota ou entregues
          if (!["in_route", "packaged", "delivered"].includes(o.status)) return false;
        }
        if (input?.status && o.status !== input.status) return false;
        if (input?.statusIn && input.statusIn.length > 0 && !input.statusIn.includes(o.status)) return false;
        if (input?.paymentStatus && o.paymentStatus !== input.paymentStatus) return false;
        if (input?.launcherId && o.launcherId !== input.launcherId) return false;
        if (input?.deliveryMethodId && o.deliveryMethodId !== input.deliveryMethodId) return false;
        if (input?.routeId && o.routeId !== input.routeId) return false;
        if (input?.search) {
          const s = input.search.toLowerCase();
          if (!o.customerName?.toLowerCase().includes(s) && !o.customerPhone?.includes(s)) return false;
        }
        if (input?.dateFrom) {
          const from = new Date(input.dateFrom);
          if (o.createdAt < from) return false;
        }
        if (input?.dateTo) {
          const to = new Date(input.dateTo);
          to.setHours(23, 59, 59);
          if (o.createdAt > to) return false;
        }
        return true;
      });

      // Quando filtrando por uma rota específica, ordena pela posição definida na rota
      // (a ordem real de visitação), em vez da ordem padrão por data de criação.
      if (input?.routeId) {
        filtered = filtered.sort((a, b) => (a.routePosition ?? 0) - (b.routePosition ?? 0));
      }

      const total = filtered.length;
      const data = filtered.slice(offset, offset + pageSize);

      // Fetch products for each order in the page
      const orderIds = data.map(o => o.id);
      const productSummaryMap: Record<number, string> = {};
      const productListMap: Record<number, string[]> = {};

      if (orderIds.length > 0) {
        // Fetch order items with flavors
        const allOrderItems = await db.select({
          id: orderItems.id, orderId: orderItems.orderId, productName: products.name,
          quantity: orderItems.quantity,
        }).from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .where(inArray(orderItems.orderId, orderIds));

        const allOrderItemIds = allOrderItems.map(i => i.id);
        const flavorMap: Record<number, string[]> = {};
        if (allOrderItemIds.length > 0) {
          const flavorRows = await db.select({
            orderItemId: orderItemFlavors.orderItemId, flavorName: orderItemFlavors.flavorName,
          }).from(orderItemFlavors).where(inArray(orderItemFlavors.orderItemId, allOrderItemIds));
          for (const f of flavorRows) {
            if (!flavorMap[f.orderItemId]) flavorMap[f.orderItemId] = [];
            flavorMap[f.orderItemId].push(f.flavorName);
          }
        }

        // Build product names per order
        const productNamesMap: Record<number, string[]> = {};
        for (const item of allOrderItems) {
          if (!productNamesMap[item.orderId]) productNamesMap[item.orderId] = [];
          const flavors = flavorMap[item.id] ?? [];
          const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
          productNamesMap[item.orderId].push(`${item.productName}${flavorStr} (${item.quantity}x)`);
        }

        // Fetch minipizzas
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
            orderMinipizzaId: orderMinipizzaFlavors.orderMinipizzaId,
            flavorName: minipizzaFlavors.name,
          }).from(orderMinipizzaFlavors)
            .leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
            .where(inArray(orderMinipizzaFlavors.orderMinipizzaId, mpIds));
          for (const f of flavorRows) {
            if (!mpFlavorMap[f.orderMinipizzaId]) mpFlavorMap[f.orderMinipizzaId] = [];
            mpFlavorMap[f.orderMinipizzaId].push(f.flavorName ?? "");
          }
        }

        for (const mp of mpRows) {
          if (!productNamesMap[mp.orderId]) productNamesMap[mp.orderId] = [];
          const flavors = mpFlavorMap[mp.id] ?? [];
          const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
          productNamesMap[mp.orderId].push(`Minipizza ${mp.typeName ?? "—"}${flavorStr} (${mp.quantity}x)`);
        }

        // Fetch jellies
        const jRows = await db.select({
          orderId: orderJellies.orderId, flavorName: jellyFlavors.name, quantity: orderJellies.quantity,
        }).from(orderJellies)
          .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
          .where(inArray(orderJellies.orderId, orderIds));

        for (const j of jRows) {
          if (!productNamesMap[j.orderId]) productNamesMap[j.orderId] = [];
          productNamesMap[j.orderId].push(`Geleia ${j.flavorName} (${j.quantity}x)`);
        }

        for (const order of data) {
          productSummaryMap[order.id] = productNamesMap[order.id]?.join(", ") ?? "—";
          productListMap[order.id] = productNamesMap[order.id] ?? [];
        }
      }

      // Enrich data with products
      const enrichedData = data.map(o => ({
        ...o,
        productSummary: productSummaryMap[o.id] ?? "—",
        productList: productListMap[o.id] ?? [],
      }));

      return { data: enrichedData, total };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orderRows = await db.select({
        id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus,
        totalAmount: orders.totalAmount, paymentMethod: orders.paymentMethod,
        deliveryDate: orders.deliveryDate, deliveryAddress: orders.deliveryAddress,
        notes: orders.notes, cancelReason: orders.cancelReason,
        cancelledAt: orders.cancelledAt, createdAt: orders.createdAt,
        customerId: orders.customerId, customerName: customers.name,
        customerPhone: customers.phone, customerStreet: customers.street,
        customerNumber: customers.number, customerComplement: customers.complement,
        customerNeighborhood: customers.neighborhood,
        customerCity: customers.city, customerLocationRef: customers.locationReference,
        launcherId: orders.launcherId, launcherName: users.name,
        deliveryMethodId: orders.deliveryMethodId, deliveryMethodName: deliveryMethods.name,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(users, eq(orders.launcherId, users.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .where(eq(orders.id, input.id))
        .limit(1);

      if (!orderRows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      const order = orderRows[0];

      const items = await db.select({
        id: orderItems.id, quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice, subtotal: orderItems.subtotal,
        productId: orderItems.productId, productName: products.name, unit: products.unit,
      }).from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, input.id));

      const mpRows = await db.select({
        id: orderMinipizzas.id, quantity: orderMinipizzas.quantity,
        unitPrice: orderMinipizzas.unitPrice, subtotal: orderMinipizzas.subtotal,
        typeId: orderMinipizzas.minipizzaTypeId, typeName: minipizzaTypes.name,
        typeUnits: minipizzaTypes.units,
      }).from(orderMinipizzas)
        .leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
        .where(eq(orderMinipizzas.orderId, input.id));

      const minipizzas = await Promise.all(mpRows.map(async mp => {
        const flavors = await db.select({ name: minipizzaFlavors.name })
          .from(orderMinipizzaFlavors)
          .leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
          .where(eq(orderMinipizzaFlavors.orderMinipizzaId, mp.id));
        return { ...mp, flavors: flavors.map(f => f.name) };
      }));

      const jellies = await db.select({
        id: orderJellies.id, quantity: orderJellies.quantity,
        unitPrice: orderJellies.unitPrice, subtotal: orderJellies.subtotal,
        flavorId: orderJellies.jellyFlavorId, flavorName: jellyFlavors.name,
      }).from(orderJellies)
        .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
        .where(eq(orderJellies.orderId, input.id));

      const history = await db.select({
        id: orderStatusHistory.id, fromStatus: orderStatusHistory.fromStatus,
        toStatus: orderStatusHistory.toStatus, notes: orderStatusHistory.notes,
        changedAt: orderStatusHistory.changedAt, userName: users.name,
      }).from(orderStatusHistory)
        .leftJoin(users, eq(orderStatusHistory.userId, users.id))
        .where(eq(orderStatusHistory.orderId, input.id))
        .orderBy(desc(orderStatusHistory.changedAt));

      return { ...order, items, minipizzas, jellies, history };
    }),

  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      deliveryMethodId: z.number(),
      deliveryDate: z.string().optional(),
      deliveryAddress: z.string().optional(),
      paymentMethod: z.enum(["cash", "pix"]),
      notes: z.string().optional(),
      totalAmount: z.string(),
      items: z.array(orderItemSchema),
      minipizzas: z.array(orderMinipizzaSchema),
      jellies: z.array(orderJellySchema),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await db.insert(orders).values({
        customerId: input.customerId,
        launcherId: ctx.user.id,
        deliveryMethodId: input.deliveryMethodId,
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : undefined,
        deliveryAddress: input.deliveryAddress,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
        totalAmount: input.totalAmount,
        status: "production",
        paymentStatus: "pending",
      });

      const orderId = Number((result as any).insertId || (result as any)[0]?.insertId);

      // Insert items
      for (const item of input.items) {
        const itemResult = await db.insert(orderItems).values({
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
        });
        const orderItemId = Number((itemResult as any).insertId || (itemResult as any)[0]?.insertId);
        
        if (item.flavorIds && item.flavorIds.length > 0) {
          // Buscar nomes dos sabores para desnormalização
          const flavors = await db.select({ id: productFlavors.id, name: productFlavors.name })
            .from(productFlavors)
            .where(inArray(productFlavors.id, item.flavorIds));

          await db.insert(orderItemFlavors).values(
            flavors.map(f => ({
              orderItemId,
              productFlavorId: f.id,
              flavorName: f.name,
            }))
          );
        }
      }

      // Insert minipizzas
      for (const mp of input.minipizzas) {
        const mpResult = await db.insert(orderMinipizzas).values({
          orderId, minipizzaTypeId: mp.minipizzaTypeId,
          quantity: mp.quantity, unitPrice: mp.unitPrice, subtotal: mp.subtotal,
        });
        const mpId = Number((mpResult as any).insertId || (mpResult as any)[0]?.insertId);
        if (mp.flavorIds.length > 0) {
          await db.insert(orderMinipizzaFlavors).values(
            mp.flavorIds.map(fId => ({ orderMinipizzaId: mpId, minipizzaFlavorId: fId }))
          );
        }
      }

      // Insert jellies
      if (input.jellies.length > 0) {
        await db.insert(orderJellies).values(input.jellies.map(j => ({ ...j, orderId })));
      }

      // Status history
      await db.insert(orderStatusHistory).values({
        orderId, userId: ctx.user.id, fromStatus: null, toStatus: "production",
        notes: "Pedido criado",
      });

      // Async background task to append to Google Sheets
      if (googleSheets.isConfigured()) {
        try {
          // Fetch full order data for the sheet
          const [orderData] = await db.select({
            id: orders.id,
            createdAt: orders.createdAt,
            totalAmount: orders.totalAmount,
            paymentMethod: orders.paymentMethod,
            deliveryDate: orders.deliveryDate,
            deliveryAddress: orders.deliveryAddress,
            notes: orders.notes,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
            customerName: customers.name,
            customerPhone: customers.phone,
            customerNeighborhood: customers.neighborhood,
            customerCity: customers.city,
            launcherName: users.name,
            deliveryMethodName: deliveryMethods.name,
          })
            .from(orders)
            .leftJoin(customers, eq(orders.customerId, customers.id))
            .leftJoin(users, eq(orders.launcherId, users.id))
            .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
            .where(eq(orders.id, orderId))
            .limit(1);

          if (orderData) {
            // Build products string (similar to export logic)
            const productsList: string[] = [];
            
            // Items
            const items = await db.select({ 
              id: orderItems.id,
              name: products.name, 
              qty: orderItems.quantity 
            })
              .from(orderItems).leftJoin(products, eq(orderItems.productId, products.id))
              .where(eq(orderItems.orderId, orderId));
            
            for (const i of items) {
              const itemFlavors = await db.select({ name: productFlavors.name })
                .from(orderItemFlavors).leftJoin(productFlavors, eq(orderItemFlavors.productFlavorId, productFlavors.id))
                .where(eq(orderItemFlavors.orderItemId, i.id));
              
              const flavorsStr = itemFlavors.length > 0 ? ` [${itemFlavors.map(f => f.name).join(", ")}]` : "";
              productsList.push(`${i.name}${flavorsStr} (${i.qty}x)`);
            }

            // Minipizzas
            const mps = await db.select({ 
              id: orderMinipizzas.id,
              type: minipizzaTypes.name, 
              qty: orderMinipizzas.quantity 
            })
              .from(orderMinipizzas).leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
              .where(eq(orderMinipizzas.orderId, orderId));
            
            for (const m of mps) {
              const mpFlavors = await db.select({ name: minipizzaFlavors.name })
                .from(orderMinipizzaFlavors).leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
                .where(eq(orderMinipizzaFlavors.orderMinipizzaId, m.id));
              
              const flavorsStr = mpFlavors.length > 0 ? ` [${mpFlavors.map(f => f.name).join(", ")}]` : "";
              productsList.push(`Minipizza ${m.type}${flavorsStr} (${m.qty}x)`);
            }

            // Jellies
            const jellies = await db.select({ flavor: jellyFlavors.name, qty: orderJellies.quantity })
              .from(orderJellies).leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
              .where(eq(orderJellies.orderId, orderId));
            jellies.forEach(j => productsList.push(`Geleia ${j.flavor} (${j.qty}x)`));

            const fullOrder = {
              ...orderData,
              products: productsList.join("; ")
            };
            
            await googleSheets.appendOrder(fullOrder);
            await uploadReceiptToDrive(fullOrder);
            await sendOrderNotification(fullOrder);
          }
        } catch (error) {
          console.error("Error in background tasks (Sheets/Drive/Telegram):", error);
        }
      }

      return { success: true, orderId };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["production", "in_route", "packaged", "delivered", "paid", "cancelled"]),
      notes: z.string().optional(),
      cancelReason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const current = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.status === "cancelled" && !input.cancelReason) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Justificativa obrigatória para cancelamento." });
      }

      const updateData: Record<string, unknown> = { status: input.status };
      if (input.status === "cancelled") {
        updateData.cancelReason = input.cancelReason;
        updateData.cancelledBy = ctx.user.id;
        updateData.cancelledAt = new Date();
        updateData.paymentStatus = "cancelled";
      }
      if (input.status === "paid") {
        updateData.paymentStatus = "paid";
      }

      await db.update(orders).set(updateData).where(eq(orders.id, input.id));
      await db.insert(orderStatusHistory).values({
        orderId: input.id, userId: ctx.user.id,
        fromStatus: current[0].status, toStatus: input.status,
        notes: input.cancelReason ?? input.notes,
      });

      // Ao cancelar, o pedido deixa de fazer parte de qualquer rota de entrega
      // (senão continuaria aparecendo como parada, contando na distância e nos links do Maps).
      if (input.status === "cancelled") {
        await db.delete(routeOrders).where(eq(routeOrders.orderId, input.id));
      }

      return { success: true };
    }),

  updatePaymentStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      paymentStatus: z.enum(["pending", "paid", "partial", "cancelled"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(orders).set({ paymentStatus: input.paymentStatus }).where(eq(orders.id, input.id));
      return { success: true };
    }),

  pendingPayments: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db.select({
      id: orders.id, totalAmount: orders.totalAmount, paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus, status: orders.status,
      deliveryDate: orders.deliveryDate, createdAt: orders.createdAt,
      deliveredAt: deliveryRecords.deliveredAt,
      customerName: customers.name, customerPhone: customers.phone,
      customerStreet: customers.street, customerNumber: customers.number,
      customerNeighborhood: customers.neighborhood, customerCity: customers.city,
      deliveryAddress: orders.deliveryAddress,
    }).from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(deliveryRecords, eq(orders.id, deliveryRecords.orderId))
      // Pedidos entregues com pagamento pendente OU parcial (ainda falta receber algo),
      // exceto de clientes internos (ex: pedidos de estoque não geram cobrança real)
      .where(and(
        or(eq(orders.paymentStatus, "pending"), eq(orders.paymentStatus, "partial")),
        eq(orders.status, "delivered"),
        sql`(${customers.isInternal} = false OR ${customers.isInternal} IS NULL)`
      ));

    // Monta a lista de produtos comprados em cada pedido (mesmo padrão usado em list)
    const orderIds = rows.map(o => o.id);
    const productListMap: Record<number, string[]> = {};

    if (orderIds.length > 0) {
      const allOrderItems = await db.select({
        id: orderItems.id, orderId: orderItems.orderId, productName: products.name,
        quantity: orderItems.quantity,
      }).from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));

      const allOrderItemIds = allOrderItems.map(i => i.id);
      const flavorMap: Record<number, string[]> = {};
      if (allOrderItemIds.length > 0) {
        const flavorRows = await db.select({
          orderItemId: orderItemFlavors.orderItemId, flavorName: orderItemFlavors.flavorName,
        }).from(orderItemFlavors).where(inArray(orderItemFlavors.orderItemId, allOrderItemIds));
        for (const f of flavorRows) {
          (flavorMap[f.orderItemId] ??= []).push(f.flavorName);
        }
      }

      for (const item of allOrderItems) {
        const flavors = flavorMap[item.id] ?? [];
        const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
        (productListMap[item.orderId] ??= []).push(`${item.productName}${flavorStr} (${item.quantity}x)`);
      }

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

      for (const mp of mpRows) {
        const flavors = mpFlavorMap[mp.id] ?? [];
        const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
        (productListMap[mp.orderId] ??= []).push(`Minipizza ${mp.typeName ?? "—"}${flavorStr} (${mp.quantity}x)`);
      }

      const jRows = await db.select({
        orderId: orderJellies.orderId, flavorName: jellyFlavors.name, quantity: orderJellies.quantity,
      }).from(orderJellies)
        .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
        .where(inArray(orderJellies.orderId, orderIds));

      for (const j of jRows) {
        (productListMap[j.orderId] ??= []).push(`Geleia ${j.flavorName} (${j.quantity}x)`);
      }
    }

    return rows.map(o => ({ ...o, productList: productListMap[o.id] ?? [] }));
  }),

  bulkUpdateStatus: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
      status: z.enum(["production", "in_route", "packaged", "delivered", "paid", "cancelled"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const updateData: Record<string, any> = { status: input.status };
      if (input.status === "paid") updateData.paymentStatus = "paid";
      if (input.status === "cancelled") {
        updateData.paymentStatus = "cancelled";
        updateData.cancelledBy = ctx.user.id;
        updateData.cancelledAt = new Date();
      }

      // Get current statuses for history
      const currentOrders = await db.select({ id: orders.id, status: orders.status }).from(orders).where(inArray(orders.id, input.ids));

      await db.update(orders).set(updateData).where(inArray(orders.id, input.ids));

      // Record history
      if (currentOrders.length > 0) {
        await db.insert(orderStatusHistory).values(
          currentOrders.map(o => ({
            orderId: o.id,
            userId: ctx.user.id,
            fromStatus: o.status,
            toStatus: input.status,
            notes: "Atualização em massa",
          }))
        );
      }

      // Ao cancelar, os pedidos deixam de fazer parte de qualquer rota de entrega
      if (input.status === "cancelled" && input.ids.length > 0) {
        await db.delete(routeOrders).where(inArray(routeOrders.orderId, input.ids));
      }

      return { success: true };
    }),

  bulkUpdatePaymentStatus: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
      paymentStatus: z.enum(["pending", "paid", "partial", "cancelled"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(orders).set({ paymentStatus: input.paymentStatus }).where(inArray(orders.id, input.ids));
      return { success: true };
    }),

  bulkDelete: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      // Delete from related tables first
      await db.delete(orderItems).where(inArray(orderItems.orderId, input.ids));
      await db.delete(orderItemFlavors).where(inArray(orderItemFlavors.orderItemId, 
        db.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.orderId, input.ids))
      ));
      await db.delete(orderMinipizzas).where(inArray(orderMinipizzas.orderId, input.ids));
      await db.delete(orderMinipizzaFlavors).where(inArray(orderMinipizzaFlavors.orderMinipizzaId,
        db.select({ id: orderMinipizzas.id }).from(orderMinipizzas).where(inArray(orderMinipizzas.orderId, input.ids))
      ));
      await db.delete(orderJellies).where(inArray(orderJellies.orderId, input.ids));
      await db.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, input.ids));
      await db.delete(deliveryRecords).where(inArray(deliveryRecords.orderId, input.ids));
      await db.delete(paymentRecords).where(inArray(paymentRecords.orderId, input.ids));
      await db.delete(routeOrders).where(inArray(routeOrders.orderId, input.ids));
      
      // Finally delete the orders
      await db.delete(orders).where(inArray(orders.id, input.ids));
      return { success: true };
    }),
});
