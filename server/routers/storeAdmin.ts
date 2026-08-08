/**
 * Router administrativo da Loja Pública — controlado de dentro do CRM Integrarte
 * (protegido por login, adminProcedure). Cuida de: abrir/fechar a loja, escolher
 * quais produtos do Estoque aparecem nela, e listar os pedidos vindos de lá.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  customers, deliveryMethods, orders, products, productCategories,
  storeOrderPayments, storeProductVisibility, storeSettings, estoqueAtual,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";

export const storeAdminRouter = router({
  /** Configuração atual da loja (aberta/fechada) */
  getSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [settings] = await db.select().from(storeSettings).orderBy(desc(storeSettings.id)).limit(1);
    return settings ?? null;
  }),

  /** Abre ou fecha a loja pública */
  updateSettings: adminProcedure
    .input(z.object({ isOpen: z.boolean(), closedMessage: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select({ id: storeSettings.id }).from(storeSettings).orderBy(desc(storeSettings.id)).limit(1);
      if (existing) {
        await db.update(storeSettings)
          .set({ isOpen: input.isOpen, closedMessage: input.closedMessage, updatedBy: ctx.user.id })
          .where(eq(storeSettings.id, existing.id));
      } else {
        await db.insert(storeSettings).values({ isOpen: input.isOpen, closedMessage: input.closedMessage, updatedBy: ctx.user.id });
      }
      return { success: true };
    }),

  /**
   * Produtos do Estoque disponíveis pra curadoria — mostra todo produto com
   * quantidade em estoque > 0, junto com o estado atual de visibilidade na loja
   * (se ainda não configurado, aparece como "não visível" por padrão — opt-in).
   */
  listStockProducts: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const estoqueLinhas = await db.select({ productId: estoqueAtual.productId, quantidade: estoqueAtual.quantidade })
      .from(estoqueAtual).where(gte(estoqueAtual.quantidade, 1));
    const qtyByProduct: Record<number, number> = {};
    for (const l of estoqueLinhas) qtyByProduct[l.productId] = (qtyByProduct[l.productId] ?? 0) + l.quantidade;

    const productIds = Object.keys(qtyByProduct).map(Number);
    if (productIds.length === 0) return [];

    const prods = await db.select({
      id: products.id, name: products.name, price: products.price, unit: products.unit,
      categoryId: products.categoryId, categoryName: productCategories.name,
    }).from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(inArray(products.id, productIds));

    const visibilidade = await db.select().from(storeProductVisibility).where(inArray(storeProductVisibility.productId, productIds));
    const visMap = new Map(visibilidade.map(v => [v.productId, v]));

    return prods.map(p => ({
      ...p,
      stockQuantity: qtyByProduct[p.id] ?? 0,
      visible: visMap.get(p.id)?.visible ?? false,
      storePrice: visMap.get(p.id)?.storePrice ?? null,
    })).sort((a, b) => (a.categoryName ?? "").localeCompare(b.categoryName ?? "") || a.name.localeCompare(b.name));
  }),

  /** Marca um produto como visível/oculto na loja, e opcionalmente define um preço específico */
  setProductVisibility: adminProcedure
    .input(z.object({ productId: z.number(), visible: z.boolean(), storePrice: z.string().nullable().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select({ id: storeProductVisibility.id }).from(storeProductVisibility)
        .where(eq(storeProductVisibility.productId, input.productId)).limit(1);
      if (existing) {
        await db.update(storeProductVisibility)
          .set({ visible: input.visible, storePrice: input.storePrice ?? null })
          .where(eq(storeProductVisibility.id, existing.id));
      } else {
        await db.insert(storeProductVisibility).values({
          productId: input.productId, visible: input.visible, storePrice: input.storePrice ?? null,
        });
      }
      return { success: true };
    }),

  /** Lista os pedidos vindos da Loja Pública, com status de pagamento e entrega */
  orders: adminProcedure
    .input(z.object({ paymentStatus: z.enum(["pending", "paid", "partial", "cancelled"]).optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(orders.channel, "loja_publica")];
      if (input?.paymentStatus) conditions.push(eq(orders.paymentStatus, input.paymentStatus));

      const rows = await db.select({
        id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus,
        totalAmount: orders.totalAmount, paymentMethod: orders.paymentMethod,
        createdAt: orders.createdAt, deliveryMethodId: orders.deliveryMethodId,
        deliveryMethodName: deliveryMethods.name,
        customerName: customers.name, customerPhone: customers.phone,
      }).from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

      if (rows.length === 0) return [];
      const payments = await db.select().from(storeOrderPayments).where(inArray(storeOrderPayments.orderId, rows.map(r => r.id)));
      const paymentByOrder = new Map(payments.map(p => [p.orderId, p]));

      return rows.map(r => ({ ...r, payment: paymentByOrder.get(r.id) ?? null }));
    }),
});
