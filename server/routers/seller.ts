/**
 * Router público para a Área do Vendedor.
 * Não requer autenticação — o vendedor é identificado pelo userId passado na sessão local do browser.
 * Operações de escrita exigem que o userId seja de um usuário com role=launcher.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, like, or } from "drizzle-orm";
import { z } from "zod";
import {
  customers, deliveryMethods, jellyFlavors, minipizzaFlavors,
  minipizzaTypes, minipizzaTypeFlavorMatrix, orderItems, orderItemFlavors, orderJellies,
  orderMinipizzaFlavors, orderMinipizzas, orders, orderStatusHistory,
  productCategories, productFlavors, productTypes, products, users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { googleSheets } from "../google-sheets";
import { uploadReceiptToDrive } from "../google-drive";
import { sendOrderNotification } from "../telegram";

// Helper: validate that userId belongs to a launcher/seller
// id=-1 is the special "Outro" (guest) seller — allowed without DB lookup
async function requireLauncher(userId: number) {
  if (userId === -1) return null; // guest seller: sem vínculo a usuário cadastrado
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const result = await db.select().from(users)
    .where(and(eq(users.id, userId), eq(users.active, true)))
    .limit(1);
  const user = result[0];
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Vendedor não encontrado." });
  // Check legacy role OR new roles array
  const hasLauncherRole = user.role === "launcher" || (user.roles && user.roles.includes('"launcher"'));
  if (!hasLauncherRole && user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a vendedores." });
  }
  return user;
}

export const sellerRouter = router({
  /** Lista todos os vendedores ativos (para seleção na tela inicial) */
  listSellers: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    // Users with launcher in legacy role OR in roles JSON array
    const allActive = await db.select({ id: users.id, name: users.name, role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.active, true))
      .orderBy(asc(users.name));
    return allActive
      .filter(u => u.role === "launcher" || (u.roles && u.roles.includes('"launcher"')))
      .map(u => ({ id: u.id, name: u.name }));
  }),

  /** Catálogo público: categorias, produtos, sabores, formas de entrega */
  catalog: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { categories: [], productTypes: [], products: [], productFlavors: [], minipizzaTypes: [], minipizzaFlavors: [], compatibility: [], jellyFlavors: [], deliveryMethods: [] };
    const { asc } = await import("drizzle-orm");
    const [cats, ptypes, prods, pflav, mptypes, mpflavors, compat, jflavors, dmethods] = await Promise.all([
      db.select().from(productCategories)
        .where(eq(productCategories.active, true))
        .orderBy(asc(productCategories.sortOrder), asc(productCategories.name)),
      db.select({
        id: productTypes.id,
        name: productTypes.name,
        categoryId: productTypes.categoryId,
      })
        .from(productTypes)
        .where(eq(productTypes.active, true)),
      db.select().from(products).where(eq(products.active, true)),
      db.select().from(productFlavors).where(eq(productFlavors.active, true)),
      db.select().from(minipizzaTypes).where(eq(minipizzaTypes.active, true)),
      db.select().from(minipizzaFlavors).where(eq(minipizzaFlavors.active, true)),
      db.select().from(minipizzaTypeFlavorMatrix),
      db.select().from(jellyFlavors).where(eq(jellyFlavors.active, true)),
      db.select().from(deliveryMethods).where(eq(deliveryMethods.active, true)),
    ]);
    return { categories: cats, productTypes: ptypes, products: prods, productFlavors: pflav, minipizzaTypes: mptypes, minipizzaFlavors: mpflavors, compatibility: compat, jellyFlavors: jflavors, deliveryMethods: dmethods };
  }),

  /** Busca clientes por nome ou telefone */
  searchCustomers: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { like, or } = await import("drizzle-orm");
      return db.select().from(customers)
        .where(or(
          like(customers.name, `%${input.query}%`),
          like(customers.phone, `%${input.query}%`),
        ))
        .limit(10);
    }),

  /** Cria um novo cliente */
  createCustomer: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      phone: z.string().min(1),
      street: z.string().optional(),
      number: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      complement: z.string().optional(),
      zipCode: z.string().optional(),
      locationReference: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.insert(customers).values({
        name: input.name,
        phone: input.phone,
        street: input.street,
        number: input.number,
        complement: input.complement,
        neighborhood: input.neighborhood,
        city: input.city,
        zipCode: input.zipCode,
        locationReference: input.locationReference,
      });
      return { id: Number((result as any)[0].insertId) };
    }),

  /** Lança um novo pedido (requer sellerId válido com role=launcher) */
  createOrder: publicProcedure
    .input(z.object({
      sellerId: z.number(),
      customerId: z.number(),
      deliveryMethodId: z.number(),
      deliveryDate: z.string().optional(),
      deliveryAddress: z.string().optional(),
      paymentMethod: z.enum(["cash", "pix"]),
      notes: z.string().optional(),
      totalAmount: z.string(),
      items: z.array(z.object({
        productId: z.number(),
        quantity: z.number(),
        unitPrice: z.string(),
        subtotal: z.string(),
        flavorIds: z.array(z.number()).optional(),
      })),
      // Legacy arrays kept for backward compat
      minipizzas: z.array(z.object({
        minipizzaTypeId: z.number(),
        quantity: z.number(),
        unitPrice: z.string(),
        subtotal: z.string(),
        flavorIds: z.array(z.number()),
      })),
      jellies: z.array(z.object({
        jellyFlavorId: z.number(),
        quantity: z.number(),
        unitPrice: z.string(),
        subtotal: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      await requireLauncher(input.sellerId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.insert(orders).values({
        customerId: input.customerId,
        launcherId: input.sellerId,
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
      
      // Save order items (new unified system)
      for (const item of input.items) {
        const itemResult = await db.insert(orderItems).values({
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
        });
        const orderItemId = Number((itemResult as any).insertId || (itemResult as any)[0]?.insertId);
        
        // Save flavor selections if any
        if (item.flavorIds && item.flavorIds.length > 0) {
          const flavorRows = await db.select().from(productFlavors)
            .where(inArray(productFlavors.id, item.flavorIds));
          const flavorValues = flavorRows.map(f => ({
            orderItemId,
            productFlavorId: f.id,
            flavorName: f.name,
          }));
          if (flavorValues.length > 0) {
            await db.insert(orderItemFlavors).values(flavorValues);
          }
        }
      }
      
      // Legacy: save minipizzas (for old orders)
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
      // Legacy: save jellies
      if (input.jellies.length > 0) {
        await db.insert(orderJellies).values(input.jellies.map(j => ({ ...j, orderId })));
      }
      
      await db.insert(orderStatusHistory).values({
        orderId, userId: input.sellerId, fromStatus: null, toStatus: "production",
        notes: "Pedido criado pelo vendedor",
      });

      // Async background task to append to Google Sheets and Drive
      if (googleSheets.isConfigured()) {
        try {
          const [orderData] = await db.select({
            id: orders.id, createdAt: orders.createdAt, totalAmount: orders.totalAmount,
            paymentMethod: orders.paymentMethod, deliveryDate: orders.deliveryDate,
            deliveryAddress: orders.deliveryAddress, notes: orders.notes,
            status: orders.status, paymentStatus: orders.paymentStatus,
            customerName: customers.name, customerPhone: customers.phone,
            customerNeighborhood: customers.neighborhood, customerCity: customers.city,
            launcherName: users.name, deliveryMethodName: deliveryMethods.name,
          })
            .from(orders)
            .leftJoin(customers, eq(orders.customerId, customers.id))
            .leftJoin(users, eq(orders.launcherId, users.id))
            .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
            .where(eq(orders.id, orderId))
            .limit(1);

          if (orderData) {
            const productsList: string[] = [];
            const items = await db.select({ id: orderItems.id, name: products.name, qty: orderItems.quantity })
              .from(orderItems).leftJoin(products, eq(orderItems.productId, products.id))
              .where(eq(orderItems.orderId, orderId));
            
            for (const i of items) {
              const itemFlavors = await db.select({ name: productFlavors.name })
                .from(orderItemFlavors).leftJoin(productFlavors, eq(orderItemFlavors.productFlavorId, productFlavors.id))
                .where(eq(orderItemFlavors.orderItemId, i.id));
              const flavorsStr = itemFlavors.length > 0 ? ` [${itemFlavors.map(f => f.name).join(", ")}]` : "";
              productsList.push(`${i.name}${flavorsStr} (${i.qty}x)`);
            }

            const mps = await db.select({ id: orderMinipizzas.id, type: minipizzaTypes.name, qty: orderMinipizzas.quantity })
              .from(orderMinipizzas).leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
              .where(eq(orderMinipizzas.orderId, orderId));
            
            for (const m of mps) {
              const mpFlavors = await db.select({ name: minipizzaFlavors.name })
                .from(orderMinipizzaFlavors).leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
                .where(eq(orderMinipizzaFlavors.orderMinipizzaId, m.id));
              const flavorsStr = mpFlavors.length > 0 ? ` [${mpFlavors.map(f => f.name).join(", ")}]` : "";
              productsList.push(`Minipizza ${m.type}${flavorsStr} (${m.qty}x)`);
            }

            const jellies = await db.select({ flavor: jellyFlavors.name, qty: orderJellies.quantity })
              .from(orderJellies).leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
              .where(eq(orderJellies.orderId, orderId));
            jellies.forEach(j => productsList.push(`Geleia ${j.flavor} (${j.qty}x)`));

            const fullOrder = { ...orderData, products: productsList.join("; ") };
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

  /** Lista os pedidos do vendedor */
  myOrders: publicProcedure
    .input(z.object({
      sellerId: z.number(),
      status: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input }) => {
      await requireLauncher(input.sellerId);
      const db = await getDb();
      if (!db) return { orders: [], total: 0 };
      const { sql, count } = await import("drizzle-orm");
      // sellerId=-1 é vendedor avulso: mostra todos os pedidos sem filtro de launcher
      const conditions = input.sellerId === -1 ? [] : [eq(orders.launcherId, input.sellerId)];
      if (input.status && input.status !== "all") {
        conditions.push(eq(orders.status, input.status as any));
      }
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db.select({
        id: orders.id,
        totalAmount: orders.totalAmount,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        paymentMethod: orders.paymentMethod,
        createdAt: orders.createdAt,
        deliveryDate: orders.deliveryDate,
        customerName: customers.name,
        customerPhone: customers.phone,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt))
        .limit(input.pageSize)
        .offset(offset);
      const totalResult = await db.select({ count: count() }).from(orders).where(and(...conditions));
      return { orders: rows, total: totalResult[0]?.count ?? 0 };
    }),

  /** Detalhes de um pedido (apenas se pertencer ao vendedor) */
  orderDetail: publicProcedure
    .input(z.object({ orderId: z.number(), sellerId: z.number() }))
    .query(async ({ input }) => {
      await requireLauncher(input.sellerId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const orderResult = await db.select().from(orders)
        .where(and(eq(orders.id, input.orderId), eq(orders.launcherId, input.sellerId)))
        .limit(1);
      if (!orderResult[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      const order = orderResult[0];
      const [items, minipizzasData, jelliesData, customerData, deliveryMethodData] = await Promise.all([
        db.select({ id: orderItems.id, productId: orderItems.productId, quantity: orderItems.quantity, unitPrice: orderItems.unitPrice, subtotal: orderItems.subtotal, productName: products.name, unit: products.unit })
          .from(orderItems).leftJoin(products, eq(orderItems.productId, products.id))
          .where(eq(orderItems.orderId, input.orderId)),
        db.select({ id: orderMinipizzas.id, minipizzaTypeId: orderMinipizzas.minipizzaTypeId, quantity: orderMinipizzas.quantity, unitPrice: orderMinipizzas.unitPrice, subtotal: orderMinipizzas.subtotal, typeName: minipizzaTypes.name, typeUnits: minipizzaTypes.units })
          .from(orderMinipizzas).leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
          .where(eq(orderMinipizzas.orderId, input.orderId)),
        db.select({ id: orderJellies.id, jellyFlavorId: orderJellies.jellyFlavorId, quantity: orderJellies.quantity, unitPrice: orderJellies.unitPrice, subtotal: orderJellies.subtotal, flavorName: jellyFlavors.name })
          .from(orderJellies).leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
          .where(eq(orderJellies.orderId, input.orderId)),
        db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1),
        db.select({ name: deliveryMethods.name }).from(deliveryMethods).where(eq(deliveryMethods.id, order.deliveryMethodId)).limit(1),
      ]);
      
      // Fetch flavor info for each order item
      const itemsWithFlavors = await Promise.all(items.map(async (item) => {
        const flavorsData = await db.select().from(orderItemFlavors)
          .where(eq(orderItemFlavors.orderItemId, item.id));
        return { ...item, flavors: flavorsData };
      }));
      
      // Mapear minipizzas para incluir sabores no formato esperado pelo recibo
      const minipizzasWithFlavors = await Promise.all(minipizzasData.map(async (mp) => {
        const flavors = await db.select({ name: minipizzaFlavors.name })
          .from(orderMinipizzaFlavors)
          .leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
          .where(eq(orderMinipizzaFlavors.orderMinipizzaId, mp.id));
        return { ...mp, flavors: flavors.map(f => f.name) };
      }));

      return { 
        ...order, 
        customer: customerData[0], 
        customerName: customerData[0]?.name,
        customerPhone: customerData[0]?.phone,
        customerStreet: customerData[0]?.street,
        customerNumber: customerData[0]?.number,
        customerNeighborhood: customerData[0]?.neighborhood,
        customerCity: customerData[0]?.city,
        customerLocationRef: customerData[0]?.locationReference,
        deliveryMethodName: deliveryMethodData[0]?.name,
        items: itemsWithFlavors, 
        minipizzas: minipizzasWithFlavors, 
        jellies: jelliesData 
      };
    }),

  /** Atualiza o status de pagamento de um pedido próprio */
  updatePaymentStatus: publicProcedure
    .input(z.object({
      orderId: z.number(),
      sellerId: z.number(),
      paymentStatus: z.enum(["pending", "paid", "partial", "cancelled"]),
    }))
    .mutation(async ({ input }) => {
      await requireLauncher(input.sellerId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const current = await db.select().from(orders)
        .where(and(eq(orders.id, input.orderId), eq(orders.launcherId, input.sellerId)))
        .limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });

      await db.update(orders)
        .set({ paymentStatus: input.paymentStatus })
        .where(eq(orders.id, input.orderId));

      return { success: true };
    }),

  /** Cancela um pedido próprio (apenas se ainda em produção) */
  cancelOrder: publicProcedure
    .input(z.object({ orderId: z.number(), sellerId: z.number(), cancelReason: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await requireLauncher(input.sellerId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const current = await db.select().from(orders)
        .where(and(eq(orders.id, input.orderId), eq(orders.launcherId, input.sellerId)))
        .limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      if (current[0].status !== "production") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas pedidos em produção podem ser cancelados pelo vendedor." });
      }
      await db.update(orders).set({
        status: "cancelled",
        paymentStatus: "cancelled",
        cancelReason: input.cancelReason,
        cancelledBy: input.sellerId,
        cancelledAt: new Date(),
      }).where(eq(orders.id, input.orderId));
      await db.insert(orderStatusHistory).values({
        orderId: input.orderId, userId: input.sellerId,
        fromStatus: "production", toStatus: "cancelled",
        notes: input.cancelReason,
      });
      return { success: true };
    }),
});
