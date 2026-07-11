import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import PDFDocument from "pdfkit";
import {
  deliveryRoutes, routeOrders, orders, customers, users,
  deliveryRecords, paymentRecords, deliveryMethods, orderStatusHistory,
  orderItems, orderItemFlavors, products, productFlavors,
  orderMinipizzas, orderMinipizzaFlavors, minipizzaTypes, minipizzaFlavors,
  orderJellies, jellyFlavors,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

// ─── DELIVERY ROUTES ──────────────────────────────────────────────────────────
const routesRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      deliveryUserId: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db.select({
        id: deliveryRoutes.id, name: deliveryRoutes.name,
        deliveryDate: deliveryRoutes.deliveryDate, status: deliveryRoutes.status,
        startedAt: deliveryRoutes.startedAt, completedAt: deliveryRoutes.completedAt,
        createdAt: deliveryRoutes.createdAt,
        deliveryUserId: deliveryRoutes.deliveryUserId,
        deliveryUserName: users.name,
        totalDistance: deliveryRoutes.totalDistance,
        startingAddress: deliveryRoutes.startingAddress,
      })
        .from(deliveryRoutes)
        .leftJoin(users, eq(deliveryRoutes.deliveryUserId, users.id))
        .orderBy(desc(deliveryRoutes.deliveryDate));

      return rows.filter(r => {
        if (ctx.user.role === "delivery" && r.deliveryUserId !== ctx.user.id) return false;
        if (input?.status && r.status !== input.status) return false;
        if (input?.deliveryUserId && r.deliveryUserId !== input.deliveryUserId) return false;
        return true;
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const route = await db.select({
        id: deliveryRoutes.id, name: deliveryRoutes.name,
        deliveryDate: deliveryRoutes.deliveryDate, status: deliveryRoutes.status,
        startedAt: deliveryRoutes.startedAt, completedAt: deliveryRoutes.completedAt,
        deliveryUserId: deliveryRoutes.deliveryUserId, deliveryUserName: users.name,
        totalDistance: deliveryRoutes.totalDistance,
        startingAddress: deliveryRoutes.startingAddress,
      })
        .from(deliveryRoutes)
        .leftJoin(users, eq(deliveryRoutes.deliveryUserId, users.id))
        .where(eq(deliveryRoutes.id, input.id))
        .limit(1);

      if (!route[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const routeOrderRows = await db.select({
        id: routeOrders.id, position: routeOrders.position,
        orderId: routeOrders.orderId,
        orderStatus: orders.status, orderTotal: orders.totalAmount,
        customerName: customers.name, customerPhone: customers.phone,
        deliveryAddress: orders.deliveryAddress,
        customerStreet: customers.street, customerNumber: customers.number,
        customerNeighborhood: customers.neighborhood, customerCity: customers.city,
        customerZipCode: customers.zipCode,
      })
        .from(routeOrders)
        .leftJoin(orders, eq(routeOrders.orderId, orders.id))
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(eq(routeOrders.routeId, input.id), ne(orders.status, "cancelled")))
        .orderBy(asc(routeOrders.position));

      return { ...route[0], orders: routeOrderRows };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      deliveryDate: z.string(),
      deliveryUserId: z.number(),
      orderIds: z.array(z.number()).min(1),
      startingAddress: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const values: any = {
        name: input.name,
        deliveryDate: new Date(input.deliveryDate),
        deliveryUserId: input.deliveryUserId,
        createdBy: ctx.user.id,
        status: "planned",
      };

      if (input.startingAddress && input.startingAddress.trim() !== "") {
        values.startingAddress = input.startingAddress;
      }

      const result = await db.insert(deliveryRoutes).values(values);

      const routeId = Number((result as any).insertId);

      await db.insert(routeOrders).values(
        input.orderIds.map((orderId, idx) => ({ routeId, orderId, position: idx + 1 }))
      );

      // O status do pedido NÃO muda ao entrar numa rota — continua "Em Produção" até
      // ser empacotado, e só vira "Em Rota" de fato quando a rota for iniciada (o
      // entregador sair para entrega). Isso reflete o fluxo real: inserir pedido →
      // criar rota → empacotar → sair para entrega → entregue.

      return { success: true, routeId };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["planned", "in_progress", "completed"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const updateData: Record<string, unknown> = { status: input.status };
      if (input.status === "in_progress") updateData.startedAt = new Date();
      if (input.status === "completed") updateData.completedAt = new Date();

      await db.update(deliveryRoutes).set(updateData).where(eq(deliveryRoutes.id, input.id));

      // Ao iniciar a rota (entregador saiu para entrega), os pedidos dela passam de
      // fato para "Em Rota" — antes disso (rota só criada/planejada), o pedido fica
      // em produção/empacotado, aguardando a saída.
      if (input.status === "in_progress") {
        const routeOrderRows = await db.select({ orderId: routeOrders.orderId, status: orders.status })
          .from(routeOrders)
          .leftJoin(orders, eq(routeOrders.orderId, orders.id))
          .where(eq(routeOrders.routeId, input.id));

        const toUpdate = routeOrderRows.filter(o => o.status === "production" || o.status === "packaged");
        if (toUpdate.length > 0) {
          await db.update(orders).set({ status: "in_route" })
            .where(inArray(orders.id, toUpdate.map(o => o.orderId)));
          await db.insert(orderStatusHistory).values(
            toUpdate.map(o => ({
              orderId: o.orderId, userId: ctx.user.id,
              fromStatus: o.status, toStatus: "in_route",
              notes: "Rota iniciada — saiu para entrega",
            }))
          );
        }
      }

      return { success: true };
    }),

  reorderOrders: protectedProcedure
    .input(z.object({
      routeId: z.number(),
      orderedIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      for (let i = 0; i < input.orderedIds.length; i++) {
        await db.update(routeOrders)
          .set({ position: i + 1 })
          .where(and(eq(routeOrders.routeId, input.routeId), eq(routeOrders.orderId, input.orderedIds[i])));
      }
      return { success: true };
    }),

  // Remove um único pedido da rota manualmente (ex: cliente pediu para não entregar
  // mais). O pedido volta para "produção" e as posições restantes são renumeradas.
  removeOrder: protectedProcedure
    .input(z.object({ routeId: z.number(), orderId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [current] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, input.orderId));
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });

      await db.delete(routeOrders).where(and(
        eq(routeOrders.routeId, input.routeId),
        eq(routeOrders.orderId, input.orderId)
      ));

      // Só volta para "produção" se o pedido ainda não foi entregue/pago/cancelado
      if (!["delivered", "paid", "cancelled"].includes(current.status)) {
        await db.update(orders).set({ status: "production" }).where(eq(orders.id, input.orderId));
        await db.insert(orderStatusHistory).values({
          orderId: input.orderId, userId: ctx.user.id, fromStatus: current.status, toStatus: "production",
          notes: "Removido manualmente da rota",
        });
      }

      // Renumera as posições restantes para não deixar "buracos" na sequência
      const remaining = await db.select({ id: routeOrders.id, position: routeOrders.position })
        .from(routeOrders)
        .where(eq(routeOrders.routeId, input.routeId))
        .orderBy(asc(routeOrders.position));
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].position !== i + 1) {
          await db.update(routeOrders).set({ position: i + 1 }).where(eq(routeOrders.id, remaining[i].id));
        }
      }

      return { success: true };
    }),

  // Move um pedido de uma rota para outra (ex: cliente só pode receber no horário
  // de saída de outro entregador). Sai da rota de origem e entra no fim da rota de
  // destino, mantendo o status "Em Rota" (não volta para produção).
  moveOrder: protectedProcedure
    .input(z.object({ fromRouteId: z.number(), toRouteId: z.number(), orderId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (input.fromRouteId === input.toRouteId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A rota de destino precisa ser diferente da atual." });
      }

      const [current] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, input.orderId));
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      if (["delivered", "paid", "cancelled"].includes(current.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este pedido já foi finalizado e não pode ser movido de rota." });
      }

      const [alreadyInTarget] = await db.select({ id: routeOrders.id }).from(routeOrders)
        .where(and(eq(routeOrders.routeId, input.toRouteId), eq(routeOrders.orderId, input.orderId)));
      if (alreadyInTarget) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este pedido já está na rota de destino." });
      }

      // Remove da rota de origem
      await db.delete(routeOrders).where(and(
        eq(routeOrders.routeId, input.fromRouteId),
        eq(routeOrders.orderId, input.orderId)
      ));

      // Renumera as posições restantes da rota de origem
      const remainingSource = await db.select({ id: routeOrders.id, position: routeOrders.position })
        .from(routeOrders)
        .where(eq(routeOrders.routeId, input.fromRouteId))
        .orderBy(asc(routeOrders.position));
      for (let i = 0; i < remainingSource.length; i++) {
        if (remainingSource[i].position !== i + 1) {
          await db.update(routeOrders).set({ position: i + 1 }).where(eq(routeOrders.id, remainingSource[i].id));
        }
      }

      // Adiciona no fim da rota de destino
      const [{ maxPosition } = { maxPosition: 0 }] = await db.select({
        maxPosition: sql<number>`coalesce(max(${routeOrders.position}), 0)`,
      }).from(routeOrders).where(eq(routeOrders.routeId, input.toRouteId));

      await db.insert(routeOrders).values({
        routeId: input.toRouteId, orderId: input.orderId, position: maxPosition + 1,
      });

      // O status continua "in_route" (ainda está em uma rota, só mudou qual). Se por
      // acaso o pedido já estava "packaged", também não precisa mudar — ele já foi
      // preparado e só está trocando de rota/horário de saída.
      await db.insert(orderStatusHistory).values({
        orderId: input.orderId, userId: ctx.user.id, fromStatus: current.status, toStatus: current.status,
        notes: `Movido da rota #${input.fromRouteId} para a rota #${input.toRouteId}`,
      });

      return { success: true };
    }),

  // Gera um PDF com todos os pedidos da rota, na ordem de visita, com os dados
  // completos do cliente e os itens do pedido — para o entregador imprimir.
  exportPdf: protectedProcedure
    .input(z.object({ routeId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [route] = await db.select({
        id: deliveryRoutes.id, name: deliveryRoutes.name,
        deliveryDate: deliveryRoutes.deliveryDate,
        deliveryUserName: users.name, startingAddress: deliveryRoutes.startingAddress,
      })
        .from(deliveryRoutes)
        .leftJoin(users, eq(deliveryRoutes.deliveryUserId, users.id))
        .where(eq(deliveryRoutes.id, input.routeId));
      if (!route) throw new TRPCError({ code: "NOT_FOUND" });

      const stops = await db.select({
        position: routeOrders.position, orderId: orders.id,
        status: orders.status, totalAmount: orders.totalAmount,
        paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus,
        notes: orders.notes, deliveryAddress: orders.deliveryAddress,
        deliveryMethodName: deliveryMethods.name,
        customerName: customers.name, customerPhone: customers.phone,
        customerStreet: customers.street, customerNumber: customers.number,
        customerComplement: customers.complement, customerNeighborhood: customers.neighborhood,
        customerCity: customers.city, customerZipCode: customers.zipCode,
        locationReference: customers.locationReference,
      })
        .from(routeOrders)
        .leftJoin(orders, eq(routeOrders.orderId, orders.id))
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .where(and(eq(routeOrders.routeId, input.routeId), ne(orders.status, "cancelled")))
        .orderBy(asc(routeOrders.position));

      if (stops.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Rota sem pedidos para imprimir." });

      const orderIds = stops.map(s => s.orderId!);
      const itemsByOrder: Record<number, string[]> = {};

      const itemRows = await db.select({
        orderId: orderItems.orderId,
        id: orderItems.id, productName: products.name, quantity: orderItems.quantity,
      }).from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));
      const itemIds = itemRows.map(i => i.id);
      const flavorMap: Record<number, string[]> = {};
      if (itemIds.length > 0) {
        const flavorRows = await db.select({
          orderItemId: orderItemFlavors.orderItemId, flavorName: productFlavors.name,
        }).from(orderItemFlavors)
          .leftJoin(productFlavors, eq(orderItemFlavors.productFlavorId, productFlavors.id))
          .where(inArray(orderItemFlavors.orderItemId, itemIds));
        for (const f of flavorRows) (flavorMap[f.orderItemId] ??= []).push(f.flavorName ?? "");
      }
      for (const it of itemRows) {
        const flavors = flavorMap[it.id] ?? [];
        const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
        (itemsByOrder[it.orderId] ??= []).push(`${it.quantity}x ${it.productName}${flavorStr}`);
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
        for (const f of flavorRows) (mpFlavorMap[f.orderMinipizzaId] ??= []).push(f.flavorName ?? "");
      }
      for (const mp of mpRows) {
        const flavors = mpFlavorMap[mp.id] ?? [];
        const flavorStr = flavors.length > 0 ? ` — ${flavors.join(", ")}` : "";
        (itemsByOrder[mp.orderId] ??= []).push(`${mp.quantity}x Minipizza ${mp.typeName ?? "—"}${flavorStr}`);
      }

      const jRows = await db.select({
        orderId: orderJellies.orderId, flavorName: jellyFlavors.name, quantity: orderJellies.quantity,
      }).from(orderJellies)
        .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
        .where(inArray(orderJellies.orderId, orderIds));
      for (const j of jRows) {
        (itemsByOrder[j.orderId] ??= []).push(`${j.quantity}x Geleia ${j.flavorName}`);
      }

      const buildAddr = (s: typeof stops[number]) => {
        if (s.deliveryAddress) return s.deliveryAddress;
        const parts = [
          s.customerStreet && s.customerNumber ? `${s.customerStreet}, ${s.customerNumber}` : s.customerStreet,
          s.customerComplement, s.customerNeighborhood, s.customerCity, s.customerZipCode,
        ].filter(Boolean);
        return parts.join(", ");
      };

      const paymentLabel = (m: string | null) => m === "pix" ? "PIX" : m === "cash" ? "Dinheiro" : (m ?? "—");

      return new Promise<{ base64: string; filename: string; mimeType: string }>((resolve, reject) => {
        const doc = new PDFDocument({
          size: "A4", margin: 30,
          info: { Title: `Rota - ${route.name}`, Author: "Sistema Integrarte" },
        });

        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            base64: buffer.toString("base64"),
            filename: `rota_${route.name.replace(/[^\w-]+/g, "_")}.pdf`,
            mimeType: "application/pdf",
          });
        });
        doc.on("error", reject);

        const green = "#2D6A4F";
        const mutedText = "#555555";
        const pageWidth = doc.page.width - 60;

        // Cabeçalho
        doc.rect(30, 30, pageWidth, 44).fill(green);
        doc.fillColor("#FFFFFF").fontSize(16).font("Helvetica-Bold")
          .text(route.name, 40, 40, { width: pageWidth - 20 });
        doc.fontSize(9).font("Helvetica")
          .text(
            `${route.deliveryDate ? new Date(route.deliveryDate).toLocaleDateString("pt-BR") : ""}  |  Entregador: ${route.deliveryUserName ?? "—"}  |  ${stops.length} parada(s)`,
            40, 58, { width: pageWidth - 20 }
          );

        let y = 90;

        stops.forEach((s, idx) => {
          const items = itemsByOrder[s.orderId!] ?? [];
          const blockHeight = 60 + items.length * 12 + (s.notes ? 14 : 0);

          if (y + blockHeight > doc.page.height - 40) {
            doc.addPage();
            y = 40;
          }

          // Número da parada
          doc.circle(42, y + 10, 10).fill(green);
          doc.fillColor("#FFFFFF").fontSize(10).font("Helvetica-Bold")
            .text(String(idx + 1), 42 - 5, y + 5, { width: 10, align: "center" });

          doc.fillColor("#1B1B1B").fontSize(11).font("Helvetica-Bold")
            .text(`${s.customerName ?? "—"}  (Pedido #${s.orderId})`, 62, y, { width: pageWidth - 40 });

          doc.fontSize(9).font("Helvetica").fillColor(mutedText)
            .text(`Tel: ${s.customerPhone ?? "—"}   |   ${s.deliveryMethodName ?? "—"}   |   ${paymentLabel(s.paymentMethod)} — ${s.paymentStatus === "paid" ? "Pago" : "A receber"}: R$ ${parseFloat(s.totalAmount ?? "0").toFixed(2)}`,
              62, y + 15, { width: pageWidth - 40 });

          doc.fontSize(9).font("Helvetica").fillColor("#1B1B1B")
            .text(`Endereço: ${buildAddr(s) || "—"}`, 62, y + 28, { width: pageWidth - 40 });

          let itemY = y + 41;
          if (s.locationReference) {
            doc.fontSize(8).fillColor(mutedText).text(`Ponto de referência: ${s.locationReference}`, 62, itemY, { width: pageWidth - 40 });
            itemY += 12;
          }

          if (items.length > 0) {
            doc.fontSize(9).font("Helvetica-Bold").fillColor("#1B1B1B").text("Itens:", 62, itemY);
            itemY += 12;
            for (const item of items) {
              doc.fontSize(9).font("Helvetica").text(`• ${item}`, 68, itemY, { width: pageWidth - 46 });
              itemY += 12;
            }
          }

          if (s.notes) {
            doc.fontSize(8).font("Helvetica-Oblique").fillColor(mutedText).text(`Obs: ${s.notes}`, 62, itemY, { width: pageWidth - 40 });
            itemY += 14;
          }

          doc.moveTo(30, itemY + 4).lineTo(30 + pageWidth, itemY + 4).strokeColor("#DDDDDD").stroke();
          y = itemY + 14;
        });

        doc.end();
      });
    }),


  delete: protectedProcedure
    .input(z.object({ routeIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Get all orderIds from the routes being deleted
      const routeOrderRows = await db.select({ orderId: routeOrders.orderId })
        .from(routeOrders)
        .where(inArray(routeOrders.routeId, input.routeIds));

      const orderIds = routeOrderRows.map(r => r.orderId);

      // Remove route_orders entries
      await db.delete(routeOrders).where(inArray(routeOrders.routeId, input.routeIds));

      // Remove delivery_routes entries
      await db.delete(deliveryRoutes).where(inArray(deliveryRoutes.id, input.routeIds));

      // Return orders to production status — exceto os que já foram finalizados
      // (entregues/pagos/cancelados), que devem manter seu status final.
      if (orderIds.length > 0) {
        const finalized = await db.select({ id: orders.id }).from(orders)
          .where(and(inArray(orders.id, orderIds), inArray(orders.status, ["delivered", "paid", "cancelled"])));
        const finalizedIds = new Set(finalized.map(f => f.id));
        const toRevert = orderIds.filter(id => !finalizedIds.has(id));
        if (toRevert.length > 0) {
          await db.update(orders)
            .set({ status: "production" })
            .where(inArray(orders.id, toRevert));
        }
      }

      return { success: true, deletedCount: input.routeIds.length, orderIds };
    }),

  // Orders available for routing (in_route or production with delivery date)
  availableOrders: protectedProcedure
    .input(z.object({ deliveryDate: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db.select({
        id: orders.id, totalAmount: orders.totalAmount,
        deliveryDate: orders.deliveryDate, deliveryAddress: orders.deliveryAddress,
        status: orders.status,
        customerName: customers.name, customerPhone: customers.phone,
        customerStreet: customers.street, customerNumber: customers.number,
        customerNeighborhood: customers.neighborhood, customerCity: customers.city,
        customerZipCode: customers.zipCode,
        deliveryMethodName: deliveryMethods.name,
      })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryMethods, eq(orders.deliveryMethodId, deliveryMethods.id))
        .where(eq(orders.status, "production"))
        .orderBy(asc(orders.deliveryDate));

      return rows;
    }),
});

// ─── DELIVERY RECORDS ─────────────────────────────────────────────────────────
const methodsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(deliveryMethods).where(eq(deliveryMethods.active, true)).orderBy(asc(deliveryMethods.name));
  }),
});

const deliveryRecordsRouter = router({
  register: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      notes: z.string().optional(),
      proofImageBase64: z.string().optional(),
      proofImageMime: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let proofImageUrl: string | undefined;
      let proofImageKey: string | undefined;

      if (input.proofImageBase64 && input.proofImageMime) {
        const buffer = Buffer.from(input.proofImageBase64, "base64");
        const ext = input.proofImageMime.split("/")[1] ?? "jpg";
        const key = `delivery-proofs/${input.orderId}-${Date.now()}.${ext}`;
        const stored = await storagePut(key, buffer, input.proofImageMime);
        proofImageUrl = stored.url;
        proofImageKey = stored.key;
      }

      await db.insert(deliveryRecords).values({
        orderId: input.orderId,
        deliveryUserId: ctx.user.id,
        deliveredAt: new Date(),
        notes: input.notes,
        proofImageUrl,
        proofImageKey,
      });

      await db.update(orders).set({ status: "delivered" }).where(eq(orders.id, input.orderId));

      return { success: true };
    }),

  getByOrder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(deliveryRecords).where(eq(deliveryRecords.orderId, input.orderId)).limit(1);
      return rows[0] ?? null;
    }),
});

// ─── PAYMENT RECORDS ──────────────────────────────────────────────────────────
const paymentRecordsRouter = router({
  register: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      paymentMethod: z.enum(["cash", "pix"]),
      amount: z.string(),
      notes: z.string().optional(),
      proofImageBase64: z.string().optional(),
      proofImageMime: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let proofImageUrl: string | undefined;
      let proofImageKey: string | undefined;

      if (input.proofImageBase64 && input.proofImageMime) {
        const buffer = Buffer.from(input.proofImageBase64, "base64");
        const ext = input.proofImageMime.split("/")[1] ?? "jpg";
        const key = `payment-proofs/${input.orderId}-${Date.now()}.${ext}`;
        const stored = await storagePut(key, buffer, input.proofImageMime);
        proofImageUrl = stored.url;
        proofImageKey = stored.key;
      }

      await db.insert(paymentRecords).values({
        orderId: input.orderId,
        paymentMethod: input.paymentMethod,
        amount: input.amount,
        paidAt: new Date(),
        notes: input.notes,
        proofImageUrl,
        proofImageKey,
        registeredBy: ctx.user.id,
      });

      // Check if fully paid
      const order = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (order[0]) {
        const totalPaid = await db.select({ total: paymentRecords.amount })
          .from(paymentRecords).where(eq(paymentRecords.orderId, input.orderId));
        const sumPaid = totalPaid.reduce((acc, r) => acc + parseFloat(r.total), 0);
        const orderTotal = parseFloat(order[0].totalAmount);
        const newStatus = sumPaid >= orderTotal ? "paid" : "partial";
        await db.update(orders).set({ paymentStatus: newStatus, status: sumPaid >= orderTotal ? "paid" : order[0].status })
          .where(eq(orders.id, input.orderId));
      }

      return { success: true };
    }),

  getByOrder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(paymentRecords).where(eq(paymentRecords.orderId, input.orderId)).orderBy(desc(paymentRecords.paidAt));
    }),
});

export const deliveryRouter = router({
  routes: routesRouter,
  methods: methodsRouter,
  deliveryRecords: deliveryRecordsRouter,
  paymentRecords: paymentRecordsRouter,
});
