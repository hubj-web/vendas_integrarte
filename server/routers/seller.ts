/**
 * Router da Área do Vendedor.
 * Requer login com usuário e senha (mesmo sistema de autenticação do admin/entregador).
 * O vendedor só acessa e edita os próprios pedidos — identificado pela sessão
 * autenticada (ctx.user.id), nunca por um ID informado pelo cliente.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, like, or, ne } from "drizzle-orm";
import { z } from "zod";
import {
  customers, deliveryMethods, jellyFlavors, minipizzaFlavors,
  minipizzaTypes, minipizzaTypeFlavorMatrix, orderItems, orderItemFlavors, orderJellies,
  orderMinipizzaFlavors, orderMinipizzas, orders, orderStatusHistory,
  productCategories, productFlavors, productTypes, products, users, routeOrders, paymentRecords,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { googleSheets } from "../google-sheets";
import { uploadReceiptToDrive } from "../google-drive";
import { sendOrderNotification } from "../telegram";
import type { TrpcContext } from "../_core/context";

// Helper: garante que o usuário autenticado é vendedor (função principal ou
// secundária) ou administrador — nunca confia num ID vindo do cliente.
function requireLauncherRole(ctx: TrpcContext) {
  const user = ctx.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  const isAdmin = user.role === "admin";
  let hasLauncherRole = user.role === "launcher" || isAdmin;
  if (!hasLauncherRole) {
    try {
      const parsed = JSON.parse(user.roles ?? "[]");
      hasLauncherRole = Array.isArray(parsed) && parsed.includes("launcher");
    } catch {
      hasLauncherRole = false;
    }
  }
  if (!hasLauncherRole) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a vendedores e administradores." });
  }
  return { user, isAdmin };
}

export const sellerRouter = router({
  /** Catálogo: categorias, produtos, sabores, formas de entrega */
  catalog: protectedProcedure.query(async ({ ctx }) => {
    requireLauncherRole(ctx);
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
      db.select({
        id: products.id,
        name: products.name,
        categoryId: products.categoryId,
        productTypeId: products.productTypeId,
        supplierId: products.supplierId,
        unit: products.unit,
        price: products.price,
        description: products.description,
        maxFlavors: products.maxFlavors,
        active: products.active,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      }).from(products).where(eq(products.active, true)),
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
  searchCustomers: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      requireLauncherRole(ctx);
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
  createCustomer: protectedProcedure
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
    .mutation(async ({ input, ctx }) => {
      requireLauncherRole(ctx);
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

  /** Lança um novo pedido */
  createOrder: protectedProcedure
    .input(z.object({
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
    }))
    .mutation(async ({ input, ctx }) => {
      const { user } = requireLauncherRole(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.insert(orders).values({
        customerId: input.customerId,
        launcherId: user.id,
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
      
      // Save order items (produtos, minipizzas e geleias já são todos cadastrados
      // como "produtos" no catálogo — não existe mais um caminho separado para
      // minipizza/geleia; as tabelas legadas orderMinipizzas/orderJellies só
      // continuam existindo para exibir pedidos antigos, criados antes dessa unificação).
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
      
      await db.insert(orderStatusHistory).values({
        orderId, userId: user.id, fromStatus: null, toStatus: "production",
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

  /** Lista os pedidos do vendedor (ou todos, se admin) */
  myOrders: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const { user, isAdmin } = requireLauncherRole(ctx);
      const db = await getDb();
      if (!db) return { orders: [], total: 0 };
      const { count } = await import("drizzle-orm");
      // Admin vê todos os pedidos; vendedor vê só os próprios
      const conditions = isAdmin ? [] : [eq(orders.launcherId, user.id)];
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

  /** Detalhes de um pedido (se pertencer ao vendedor OU for admin) */
  orderDetail: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { user, isAdmin } = requireLauncherRole(ctx);

      // First find the order to check its launcherId
      const baseOrder = await db.select({ launcherId: orders.launcherId }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!baseOrder[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });

      if (!isAdmin && baseOrder[0].launcherId !== user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para ver este pedido." });
      }

      const orderResult = await db.select().from(orders)
        .where(eq(orders.id, input.orderId))
        .limit(1);
      const order = orderResult[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      
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
        db.select().from(customers).where(eq(customers.id, order?.customerId ?? 0)).limit(1),
        db.select({ name: deliveryMethods.name }).from(deliveryMethods).where(eq(deliveryMethods.id, order?.deliveryMethodId ?? 0)).limit(1),
      ]).catch(err => {
        console.error("Error fetching order details:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao buscar detalhes do pedido." });
      });
      
      // Fetch flavor info for each order item
      const itemsWithFlavors = await Promise.all(items.map(async (item) => {
        const flavorRows = await db.select({ productFlavorId: orderItemFlavors.productFlavorId, name: productFlavors.name })
          .from(orderItemFlavors)
          .leftJoin(productFlavors, eq(orderItemFlavors.productFlavorId, productFlavors.id))
          .where(eq(orderItemFlavors.orderItemId, item.id));
        return { ...item, flavors: flavorRows };
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

  /** Atualiza um pedido (próprio se vendedor, qualquer um se admin) */
  updateOrder: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      customerId: z.number().optional(),
      deliveryMethodId: z.number().optional(),
      deliveryDate: z.string().optional(),
      deliveryAddress: z.string().optional(),
      paymentMethod: z.enum(["cash", "pix"]).optional(),
      notes: z.string().optional(),
      totalAmount: z.string().optional(),
      items: z.array(z.object({
        id: z.number().optional(),
        productId: z.number(),
        quantity: z.number(),
        unitPrice: z.string(),
        subtotal: z.string(),
        flavorIds: z.array(z.number()).optional(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { user, isAdmin } = requireLauncherRole(ctx);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [eq(orders.id, input.orderId)];
      if (!isAdmin) {
        conditions.push(eq(orders.launcherId, user.id));
      }

      const current = await db.select().from(orders)
        .where(and(...conditions))
        .limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      
      // Admins podem editar mesmo fora de produção; vendedor só enquanto em produção.
      if (!isAdmin && current[0].status !== "production") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas pedidos em produção podem ser editados." });
      }

      const updateData: Record<string, any> = {};
      if (input.customerId !== undefined) updateData.customerId = input.customerId;
      if (input.deliveryMethodId !== undefined) updateData.deliveryMethodId = input.deliveryMethodId;
      if (input.deliveryDate !== undefined) updateData.deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : null;
      if (input.deliveryAddress !== undefined) updateData.deliveryAddress = input.deliveryAddress;
      if (input.paymentMethod !== undefined) updateData.paymentMethod = input.paymentMethod;
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.totalAmount !== undefined) updateData.totalAmount = input.totalAmount;

      if (Object.keys(updateData).length > 0) {
        await db.update(orders).set(updateData).where(eq(orders.id, input.orderId));
      }

      if (input.items && input.items.length > 0) {
        const existingItems = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, input.orderId));
        const existingItemIds = existingItems.map(x => x.id);
        
        if (existingItemIds.length > 0) {
          await db.delete(orderItemFlavors).where(inArray(orderItemFlavors.orderItemId, existingItemIds));
          await db.delete(orderItems).where(eq(orderItems.orderId, input.orderId));
        }

        for (const item of input.items) {
          const itemResult = await db.insert(orderItems).values({
            orderId: input.orderId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          });
          const orderItemId = Number((itemResult as any).insertId || (itemResult as any)[0]?.insertId);
          
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
      }

      return { success: true, orderId: input.orderId };
    }),

  /** Atualiza o status de pagamento de um pedido próprio */
  updatePaymentStatus: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      paymentStatus: z.enum(["pending", "paid", "partial", "cancelled"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const { user, isAdmin } = requireLauncherRole(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [eq(orders.id, input.orderId)];
      if (!isAdmin) conditions.push(eq(orders.launcherId, user.id));

      const current = await db.select().from(orders)
        .where(and(...conditions))
        .limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });

      await db.update(orders)
        .set({ paymentStatus: input.paymentStatus })
        .where(eq(orders.id, input.orderId));

      // Se marcou como "pago" e ainda não existe nenhum registro de pagamento pra esse
      // pedido, cria um automaticamente — senão o valor nunca entra no Relatório
      // Financeiro (que soma a partir dos registros de pagamento, não do status).
      if (input.paymentStatus === "paid") {
        const [existing] = await db.select({ id: paymentRecords.id }).from(paymentRecords)
          .where(eq(paymentRecords.orderId, input.orderId)).limit(1);
        if (!existing) {
          await db.insert(paymentRecords).values({
            orderId: input.orderId,
            paymentMethod: current[0].paymentMethod as "cash" | "pix",
            amount: current[0].totalAmount,
            paidAt: new Date(),
            registeredBy: user.id,
            notes: "Registrado automaticamente ao marcar como pago",
          });
        }
      }

      return { success: true };
    }),

  /**
   * Lista o que está disponível em estoque — soma os itens de todos os pedidos
   * atribuídos a clientes internos (ex: "Integrarte - Estoque") que ainda não
   * foram cancelados. Cada linha representa um produto + combinação de sabores
   * específica (não mistura sabores diferentes numa mesma linha).
   */
  stockAvailable: protectedProcedure.query(async ({ ctx }) => {
    requireLauncherRole(ctx);
    const db = await getDb();
    if (!db) return [];

    const stockOrders = await db.select({ id: orders.id })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(eq(customers.isInternal, true), ne(orders.status, "cancelled")));

    if (stockOrders.length === 0) return [];
    const stockOrderIds = stockOrders.map(o => o.id);

    const itemRows = await db.select({
      id: orderItems.id, orderId: orderItems.orderId,
      productId: orderItems.productId, productName: products.name,
      unit: products.unit, quantity: orderItems.quantity, unitPrice: orderItems.unitPrice,
    }).from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(and(inArray(orderItems.orderId, stockOrderIds), eq(products.active, true)));

    if (itemRows.length === 0) return [];

    const itemIds = itemRows.map(i => i.id);
    const flavorRows = await db.select({
      orderItemId: orderItemFlavors.orderItemId, flavorName: orderItemFlavors.flavorName,
    }).from(orderItemFlavors).where(inArray(orderItemFlavors.orderItemId, itemIds));

    const flavorsByItem: Record<number, string[]> = {};
    for (const f of flavorRows) {
      (flavorsByItem[f.orderItemId] ??= []).push(f.flavorName);
    }

    // Agrupa por produto + combinação exata de sabores (não mistura lotes diferentes)
    const groups: Record<string, {
      productId: number; productName: string | null; unit: string | null;
      flavorKey: string; flavorNames: string[]; unitPrice: string;
      totalQuantity: number;
      batches: { orderItemId: number; orderId: number; quantity: number }[];
    }> = {};

    for (const it of itemRows) {
      const flavors = (flavorsByItem[it.id] ?? []).slice().sort();
      const key = `${it.productId}::${flavors.join("|")}`;
      if (!groups[key]) {
        groups[key] = {
          productId: it.productId, productName: it.productName, unit: it.unit,
          flavorKey: key, flavorNames: flavors, unitPrice: it.unitPrice,
          totalQuantity: 0, batches: [],
        };
      }
      groups[key].totalQuantity += it.quantity;
      groups[key].batches.push({ orderItemId: it.id, orderId: it.orderId, quantity: it.quantity });
    }

    return Object.values(groups)
      .filter(g => g.totalQuantity > 0)
      .sort((a, b) => (a.productName ?? "").localeCompare(b.productName ?? ""));
  }),

  /**
   * Vende uma quantidade do estoque para um cliente de verdade: cria o pedido
   * de venda normalmente (com os mesmos sabores do lote de estoque escolhido) e
   * desconta a mesma quantidade do(s) pedido(s) de estoque de origem, tudo numa
   * única ação — sem precisar lembrar de editar o pedido de estoque depois.
   */
  sellFromStock: protectedProcedure
    .input(z.object({
      productId: z.number(),
      flavorKey: z.string(), // identifica o lote (produto + sabores) escolhido
      quantity: z.number().min(1),
      customerId: z.number(),
      deliveryMethodId: z.number(),
      deliveryDate: z.string().optional(),
      deliveryAddress: z.string().optional(),
      paymentMethod: z.enum(["cash", "pix"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { user } = requireLauncherRole(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Recarrega o estoque disponível agora (evita vender algo que já foi
      // consumido por outra venda entre a hora que a tela carregou e o clique).
      const stockOrders = await db.select({ id: orders.id })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(eq(customers.isInternal, true), ne(orders.status, "cancelled")));
      const stockOrderIds = stockOrders.map(o => o.id);
      if (stockOrderIds.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não há estoque disponível." });
      }

      const itemRows = await db.select({
        id: orderItems.id, orderId: orderItems.orderId,
        productId: orderItems.productId, quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice, subtotal: orderItems.subtotal,
      }).from(orderItems)
        .where(and(inArray(orderItems.orderId, stockOrderIds), eq(orderItems.productId, input.productId)));

      const itemIds = itemRows.map(i => i.id);
      const flavorRows = itemIds.length > 0
        ? await db.select({ orderItemId: orderItemFlavors.orderItemId, flavorName: orderItemFlavors.flavorName })
            .from(orderItemFlavors).where(inArray(orderItemFlavors.orderItemId, itemIds))
        : [];
      const flavorsByItem: Record<number, string[]> = {};
      for (const f of flavorRows) (flavorsByItem[f.orderItemId] ??= []).push(f.flavorName);

      // Filtra só os lotes que batem com o sabor escolhido, mais antigos primeiro (FIFO)
      const matchingBatches = itemRows
        .filter(it => `${it.productId}::${(flavorsByItem[it.id] ?? []).slice().sort().join("|")}` === input.flavorKey)
        .sort((a, b) => a.orderId - b.orderId);

      const totalAvailable = matchingBatches.reduce((acc, b) => acc + b.quantity, 0);
      if (totalAvailable < input.quantity) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Estoque insuficiente — só há ${totalAvailable} disponível.` });
      }

      const flavorIds = itemIds.length > 0
        ? await db.select({ orderItemId: orderItemFlavors.orderItemId, productFlavorId: orderItemFlavors.productFlavorId })
            .from(orderItemFlavors).where(inArray(orderItemFlavors.orderItemId, itemIds))
        : [];
      const firstBatchFlavorIds = matchingBatches.length > 0
        ? flavorIds.filter(f => f.orderItemId === matchingBatches[0].id).map(f => f.productFlavorId)
        : [];

      const [product] = await db.select({ price: products.price }).from(products).where(eq(products.id, input.productId));
      const unitPrice = matchingBatches[0]?.unitPrice ?? product?.price ?? "0.00";
      const subtotal = (parseFloat(unitPrice) * input.quantity).toFixed(2);

      // 1) Cria o pedido de venda de verdade
      const result = await db.insert(orders).values({
        customerId: input.customerId,
        launcherId: user.id,
        deliveryMethodId: input.deliveryMethodId,
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : undefined,
        deliveryAddress: input.deliveryAddress,
        paymentMethod: input.paymentMethod,
        notes: input.notes ? `${input.notes} (vendido do estoque)` : "Vendido do estoque",
        totalAmount: subtotal,
        status: "production",
        paymentStatus: "pending",
      });
      const newOrderId = Number((result as any).insertId || (result as any)[0]?.insertId);

      const newItemResult = await db.insert(orderItems).values({
        orderId: newOrderId, productId: input.productId,
        quantity: input.quantity, unitPrice, subtotal,
      });
      const newOrderItemId = Number((newItemResult as any).insertId || (newItemResult as any)[0]?.insertId);

      if (firstBatchFlavorIds.length > 0) {
        const flavorNameRows = await db.select().from(productFlavors).where(inArray(productFlavors.id, firstBatchFlavorIds));
        await db.insert(orderItemFlavors).values(
          flavorNameRows.map(f => ({ orderItemId: newOrderItemId, productFlavorId: f.id, flavorName: f.name }))
        );
      }

      await db.insert(orderStatusHistory).values({
        orderId: newOrderId, userId: user.id, fromStatus: null, toStatus: "production",
        notes: "Pedido criado a partir do estoque",
      });

      // 2) Desconta do(s) pedido(s) de estoque de origem (mais antigos primeiro)
      let remaining = input.quantity;
      for (const batch of matchingBatches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        remaining -= take;
        const newQty = batch.quantity - take;

        if (newQty <= 0) {
          await db.delete(orderItemFlavors).where(eq(orderItemFlavors.orderItemId, batch.id));
          await db.delete(orderItems).where(eq(orderItems.id, batch.id));
        } else {
          const newSubtotal = (parseFloat(batch.unitPrice) * newQty).toFixed(2);
          await db.update(orderItems).set({ quantity: newQty, subtotal: newSubtotal }).where(eq(orderItems.id, batch.id));
        }

        // Atualiza o total do pedido de estoque de origem
        const [stockOrder] = await db.select({ totalAmount: orders.totalAmount }).from(orders).where(eq(orders.id, batch.orderId));
        if (stockOrder) {
          const newTotal = (parseFloat(stockOrder.totalAmount) - parseFloat(batch.unitPrice) * take).toFixed(2);
          await db.update(orders).set({ totalAmount: newTotal }).where(eq(orders.id, batch.orderId));
        }
      }

      return { success: true, orderId: newOrderId };
    }),

  /** Cancela um pedido próprio (bloqueado apenas se já entregue/pago/cancelado) */
  cancelOrder: protectedProcedure
    .input(z.object({ orderId: z.number(), cancelReason: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const { user, isAdmin } = requireLauncherRole(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [eq(orders.id, input.orderId)];
      if (!isAdmin) conditions.push(eq(orders.launcherId, user.id));

      const current = await db.select().from(orders)
        .where(and(...conditions))
        .limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      if (["delivered", "paid", "cancelled"].includes(current[0].status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este pedido já foi entregue, pago ou cancelado e não pode mais ser cancelado pelo vendedor." });
      }
      await db.update(orders).set({
        status: "cancelled",
        paymentStatus: "cancelled",
        cancelReason: input.cancelReason,
        cancelledBy: user.id,
        cancelledAt: new Date(),
      }).where(eq(orders.id, input.orderId));
      await db.insert(orderStatusHistory).values({
        orderId: input.orderId, userId: user.id,
        fromStatus: current[0].status, toStatus: "cancelled",
        notes: input.cancelReason,
      });
      // Ao cancelar, o pedido deixa de fazer parte de qualquer rota de entrega
      await db.delete(routeOrders).where(eq(routeOrders.orderId, input.orderId));
      return { success: true };
    }),
});
