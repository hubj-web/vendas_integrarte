/**
 * Router do Estoque Integrarte de verdade — substitui o antigo "cliente fake"
 * (Integrarte - Estoque). Duas partes:
 * - estoque: consulta o nível atual (quantidade por produto+sabor)
 * - pedidosEstoque: fluxo de compra com fornecedor (Rascunho → Enviado → Recebido)
 *   Ao marcar como "Recebido", dá entrada automática no estoque e o custo passa
 *   a contar nos relatórios financeiros como despesa.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import {
  estoqueAtual, estoqueAtualFlavors,
  pedidosEstoque, pedidosEstoqueItens, pedidosEstoqueItemFlavors,
  products, productFlavors, suppliers,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";

export const estoqueRouter = router({
  /** Estoque atual agrupado por produto + combinação exata de sabores */
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const linhas = await db.select({
      id: estoqueAtual.id, productId: estoqueAtual.productId,
      productName: products.name, unit: products.unit,
      quantidade: estoqueAtual.quantidade, custoMedioUnitario: estoqueAtual.custoMedioUnitario,
    }).from(estoqueAtual)
      .leftJoin(products, eq(estoqueAtual.productId, products.id))
      .where(gte(estoqueAtual.quantidade, 1));

    if (linhas.length === 0) return [];
    const ids = linhas.map(l => l.id);
    const flavorRows = await db.select({
      estoqueAtualId: estoqueAtualFlavors.estoqueAtualId, flavorName: estoqueAtualFlavors.flavorName,
    }).from(estoqueAtualFlavors).where(inArray(estoqueAtualFlavors.estoqueAtualId, ids));

    const flavorsByLinha: Record<number, string[]> = {};
    for (const f of flavorRows) (flavorsByLinha[f.estoqueAtualId] ??= []).push(f.flavorName);

    // Agrupa por produto + combinação exata de sabores (soma quantidades, faz
    // média ponderada do custo entre lotes diferentes do mesmo item)
    const grupos: Record<string, {
      productId: number; productName: string | null; unit: string | null;
      flavorNames: string[]; quantidade: number; valorTotalCusto: number;
    }> = {};
    for (const l of linhas) {
      const flavors = (flavorsByLinha[l.id] ?? []).slice().sort();
      const key = `${l.productId}::${flavors.join("|")}`;
      if (!grupos[key]) {
        grupos[key] = { productId: l.productId, productName: l.productName, unit: l.unit, flavorNames: flavors, quantidade: 0, valorTotalCusto: 0 };
      }
      grupos[key].quantidade += l.quantidade;
      grupos[key].valorTotalCusto += l.quantidade * parseFloat(l.custoMedioUnitario);
    }

    return Object.values(grupos)
      .map(g => ({ ...g, custoMedioUnitario: g.quantidade > 0 ? (g.valorTotalCusto / g.quantidade).toFixed(2) : "0.00" }))
      .sort((a, b) => (a.productName ?? "").localeCompare(b.productName ?? ""));
  }),
});

export const pedidosEstoqueRouter = router({
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({
      id: pedidosEstoque.id, fornecedorId: pedidosEstoque.fornecedorId, fornecedorNome: suppliers.name,
      descricao: pedidosEstoque.descricao, status: pedidosEstoque.status,
      dataEnvio: pedidosEstoque.dataEnvio, dataRecebimento: pedidosEstoque.dataRecebimento,
      createdAt: pedidosEstoque.createdAt,
    }).from(pedidosEstoque)
      .leftJoin(suppliers, eq(pedidosEstoque.fornecedorId, suppliers.id))
      .orderBy(desc(pedidosEstoque.createdAt));

    if (rows.length === 0) return [];
    const ids = rows.map(r => r.id);
    const itens = await db.select({
      pedidoEstoqueId: pedidosEstoqueItens.pedidoEstoqueId,
      quantidade: pedidosEstoqueItens.quantidade, custoUnitario: pedidosEstoqueItens.custoUnitario,
    }).from(pedidosEstoqueItens).where(inArray(pedidosEstoqueItens.pedidoEstoqueId, ids));

    const resumoPorPedido: Record<number, { itens: number; total: number }> = {};
    for (const it of itens) {
      const r = (resumoPorPedido[it.pedidoEstoqueId] ??= { itens: 0, total: 0 });
      r.itens += 1;
      r.total += it.quantidade * parseFloat(it.custoUnitario);
    }

    return rows.map(r => ({ ...r, totalItens: resumoPorPedido[r.id]?.itens ?? 0, valorTotal: resumoPorPedido[r.id]?.total ?? 0 }));
  }),

  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [pedido] = await db.select({
        id: pedidosEstoque.id, fornecedorId: pedidosEstoque.fornecedorId, fornecedorNome: suppliers.name,
        descricao: pedidosEstoque.descricao, status: pedidosEstoque.status,
        dataEnvio: pedidosEstoque.dataEnvio, dataRecebimento: pedidosEstoque.dataRecebimento,
        observacoes: pedidosEstoque.observacoes, createdAt: pedidosEstoque.createdAt,
      }).from(pedidosEstoque)
        .leftJoin(suppliers, eq(pedidosEstoque.fornecedorId, suppliers.id))
        .where(eq(pedidosEstoque.id, input.id)).limit(1);
      if (!pedido) return null;

      const itens = await db.select({
        id: pedidosEstoqueItens.id, productId: pedidosEstoqueItens.productId, productName: products.name, unit: products.unit,
        quantidade: pedidosEstoqueItens.quantidade, custoUnitario: pedidosEstoqueItens.custoUnitario,
      }).from(pedidosEstoqueItens)
        .leftJoin(products, eq(pedidosEstoqueItens.productId, products.id))
        .where(eq(pedidosEstoqueItens.pedidoEstoqueId, input.id));

      const itemIds = itens.map(i => i.id);
      const flavorRows = itemIds.length > 0
        ? await db.select({ pedidoEstoqueItemId: pedidosEstoqueItemFlavors.pedidoEstoqueItemId, flavorName: pedidosEstoqueItemFlavors.flavorName })
            .from(pedidosEstoqueItemFlavors).where(inArray(pedidosEstoqueItemFlavors.pedidoEstoqueItemId, itemIds))
        : [];
      const flavorsByItem: Record<number, string[]> = {};
      for (const f of flavorRows) (flavorsByItem[f.pedidoEstoqueItemId] ??= []).push(f.flavorName);

      return { ...pedido, itens: itens.map(i => ({ ...i, flavorNames: flavorsByItem[i.id] ?? [] })) };
    }),

  create: adminProcedure
    .input(z.object({
      fornecedorId: z.number(),
      descricao: z.string().optional(),
      observacoes: z.string().optional(),
      itens: z.array(z.object({
        productId: z.number(),
        quantidade: z.number().min(1),
        custoUnitario: z.string(),
        flavorIds: z.array(z.number()).optional(),
      })).min(1, "Adicione pelo menos um item."),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await db.insert(pedidosEstoque).values({
        fornecedorId: input.fornecedorId, descricao: input.descricao,
        observacoes: input.observacoes, status: "rascunho", createdBy: ctx.user.id,
      });
      const pedidoId = Number((result as any).insertId || (result as any)[0]?.insertId);

      for (const item of input.itens) {
        const itemResult = await db.insert(pedidosEstoqueItens).values({
          pedidoEstoqueId: pedidoId, productId: item.productId,
          quantidade: item.quantidade, custoUnitario: item.custoUnitario,
        });
        const itemId = Number((itemResult as any).insertId || (itemResult as any)[0]?.insertId);
        if (item.flavorIds && item.flavorIds.length > 0) {
          const flavorRows = await db.select().from(productFlavors).where(inArray(productFlavors.id, item.flavorIds));
          if (flavorRows.length > 0) {
            await db.insert(pedidosEstoqueItemFlavors).values(
              flavorRows.map(f => ({ pedidoEstoqueItemId: itemId, productFlavorId: f.id, flavorName: f.name }))
            );
          }
        }
      }

      return { success: true, id: pedidoId };
    }),

  /** Substitui os itens de um pedido em rascunho (edição completa) */
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      fornecedorId: z.number(),
      descricao: z.string().optional(),
      observacoes: z.string().optional(),
      itens: z.array(z.object({
        productId: z.number(),
        quantidade: z.number().min(1),
        custoUnitario: z.string(),
        flavorIds: z.array(z.number()).optional(),
      })).min(1, "Adicione pelo menos um item."),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [pedido] = await db.select({ status: pedidosEstoque.status }).from(pedidosEstoque).where(eq(pedidosEstoque.id, input.id)).limit(1);
      if (!pedido) throw new TRPCError({ code: "NOT_FOUND" });
      if (pedido.status !== "rascunho") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível editar pedidos ainda em rascunho." });
      }

      await db.update(pedidosEstoque).set({
        fornecedorId: input.fornecedorId, descricao: input.descricao, observacoes: input.observacoes,
      }).where(eq(pedidosEstoque.id, input.id));

      const existentes = await db.select({ id: pedidosEstoqueItens.id }).from(pedidosEstoqueItens).where(eq(pedidosEstoqueItens.pedidoEstoqueId, input.id));
      const existentesIds = existentes.map(e => e.id);
      if (existentesIds.length > 0) {
        await db.delete(pedidosEstoqueItemFlavors).where(inArray(pedidosEstoqueItemFlavors.pedidoEstoqueItemId, existentesIds));
        await db.delete(pedidosEstoqueItens).where(eq(pedidosEstoqueItens.pedidoEstoqueId, input.id));
      }

      for (const item of input.itens) {
        const itemResult = await db.insert(pedidosEstoqueItens).values({
          pedidoEstoqueId: input.id, productId: item.productId,
          quantidade: item.quantidade, custoUnitario: item.custoUnitario,
        });
        const itemId = Number((itemResult as any).insertId || (itemResult as any)[0]?.insertId);
        if (item.flavorIds && item.flavorIds.length > 0) {
          const flavorRows = await db.select().from(productFlavors).where(inArray(productFlavors.id, item.flavorIds));
          if (flavorRows.length > 0) {
            await db.insert(pedidosEstoqueItemFlavors).values(
              flavorRows.map(f => ({ pedidoEstoqueItemId: itemId, productFlavorId: f.id, flavorName: f.name }))
            );
          }
        }
      }

      return { success: true };
    }),

  /** Marca como enviado ao fornecedor (não mexe no estoque ainda) */
  marcarEnviado: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(pedidosEstoque).set({ status: "enviado", dataEnvio: new Date() }).where(eq(pedidosEstoque.id, input.id));
      return { success: true };
    }),

  /** Marca como recebido — dá entrada no estoque de verdade e vira custo nos relatórios */
  marcarRecebido: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [pedido] = await db.select().from(pedidosEstoque).where(eq(pedidosEstoque.id, input.id)).limit(1);
      if (!pedido) throw new TRPCError({ code: "NOT_FOUND" });
      if (pedido.status === "recebido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este pedido já foi marcado como recebido." });
      }

      const itens = await db.select().from(pedidosEstoqueItens).where(eq(pedidosEstoqueItens.pedidoEstoqueId, input.id));
      const itemIds = itens.map(i => i.id);
      const flavorRows = itemIds.length > 0
        ? await db.select().from(pedidosEstoqueItemFlavors).where(inArray(pedidosEstoqueItemFlavors.pedidoEstoqueItemId, itemIds))
        : [];
      const flavorsByItem: Record<number, typeof flavorRows> = {};
      for (const f of flavorRows) (flavorsByItem[f.pedidoEstoqueItemId] ??= []).push(f);

      for (const item of itens) {
        const estoqueResult = await db.insert(estoqueAtual).values({
          productId: item.productId, quantidade: item.quantidade, custoMedioUnitario: item.custoUnitario,
        });
        const estoqueId = Number((estoqueResult as any).insertId || (estoqueResult as any)[0]?.insertId);
        const flavors = flavorsByItem[item.id] ?? [];
        if (flavors.length > 0) {
          await db.insert(estoqueAtualFlavors).values(
            flavors.map(f => ({ estoqueAtualId: estoqueId, productFlavorId: f.productFlavorId, flavorName: f.flavorName }))
          );
        }
      }

      await db.update(pedidosEstoque).set({ status: "recebido", dataRecebimento: new Date() }).where(eq(pedidosEstoque.id, input.id));
      return { success: true };
    }),

  cancelar: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(pedidosEstoque).set({ status: "cancelado" }).where(eq(pedidosEstoque.id, input.id));
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [pedido] = await db.select({ status: pedidosEstoque.status }).from(pedidosEstoque).where(eq(pedidosEstoque.id, input.id)).limit(1);
      if (pedido?.status === "recebido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pedidos já recebidos não podem ser excluídos (afetaria o estoque e os relatórios). Cancele um novo pedido de ajuste se necessário." });
      }
      const existentes = await db.select({ id: pedidosEstoqueItens.id }).from(pedidosEstoqueItens).where(eq(pedidosEstoqueItens.pedidoEstoqueId, input.id));
      const existentesIds = existentes.map(e => e.id);
      if (existentesIds.length > 0) {
        await db.delete(pedidosEstoqueItemFlavors).where(inArray(pedidosEstoqueItemFlavors.pedidoEstoqueItemId, existentesIds));
        await db.delete(pedidosEstoqueItens).where(eq(pedidosEstoqueItens.pedidoEstoqueId, input.id));
      }
      await db.delete(pedidosEstoque).where(eq(pedidosEstoque.id, input.id));
      return { success: true };
    }),

  /** Soma o custo dos pedidos recebidos num período — usado no relatório financeiro */
  custoRecebidoNoPeriodo: adminProcedure
    .input(z.object({ dataInicio: z.string(), dataFim: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return 0;
      const inicio = new Date(input.dataInicio);
      const fim = new Date(input.dataFim);
      const pedidosRecebidos = await db.select({ id: pedidosEstoque.id }).from(pedidosEstoque)
        .where(and(eq(pedidosEstoque.status, "recebido"), gte(pedidosEstoque.dataRecebimento, inicio), lte(pedidosEstoque.dataRecebimento, fim)));
      if (pedidosRecebidos.length === 0) return 0;
      const itens = await db.select({ quantidade: pedidosEstoqueItens.quantidade, custoUnitario: pedidosEstoqueItens.custoUnitario })
        .from(pedidosEstoqueItens).where(inArray(pedidosEstoqueItens.pedidoEstoqueId, pedidosRecebidos.map(p => p.id)));
      return itens.reduce((acc, i) => acc + i.quantidade * parseFloat(i.custoUnitario), 0);
    }),
});
