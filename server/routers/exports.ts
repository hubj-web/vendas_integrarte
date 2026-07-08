import { TRPCError } from "@trpc/server";
import { eq, desc, and, gte, lte, like, or, inArray } from "drizzle-orm";
import { z } from "zod";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import {
  customers, orders, orderItems, orderItemFlavors, orderMinipizzas, orderMinipizzaFlavors,
  orderJellies, products, productFlavors, minipizzaTypes, minipizzaFlavors,
  jellyFlavors, deliveryMethods, users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut, storageGetSignedUrl } from "../storage";
import { googleSheets } from "../google-sheets";

const STATUS_LABELS: Record<string, string> = {
  production: "Em produção",
  in_route: "Em rota",
  delivered: "Entregue",
  paid: "Pago",
  cancelled: "Cancelado",
};
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  partial: "Parcial",
  cancelled: "Cancelado",
};
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
};

const exportInputSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  launcherId: z.number().optional(),
  search: z.string().optional(),
});

/**
 * Fetch orders with basic info for export
 */
async function fetchOrdersForExport(input: z.infer<typeof exportInputSchema>) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const allOrders = await db
    .select({
      id: orders.id,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalAmount: orders.totalAmount,
      paymentMethod: orders.paymentMethod,
      deliveryDate: orders.deliveryDate,
      createdAt: orders.createdAt,
      notes: orders.notes,
      deliveryAddress: orders.deliveryAddress,
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
    .orderBy(desc(orders.createdAt));

  return allOrders.filter((o) => {
    if (input.status && o.status !== input.status) return false;
    if (input.paymentStatus && o.paymentStatus !== input.paymentStatus) return false;
    if (input.search) {
      const s = input.search.toLowerCase();
      if (!o.customerName?.toLowerCase().includes(s) && !o.customerPhone?.includes(s)) return false;
    }
    if (input.dateFrom) {
      const from = new Date(input.dateFrom);
      if (o.createdAt < from) return false;
    }
    if (input.dateTo) {
      const to = new Date(input.dateTo);
      to.setHours(23, 59, 59);
      if (o.createdAt > to) return false;
    }
    return true;
  });
}

/**
 * Fetch detailed items (products, minipizzas, jellies) for a set of orders
 */
async function fetchItemsForOrders(orderIds: number[]) {
  const db = await getDb();
  if (!db) return {};

  const result: Record<number, { name: string; qty: number; price: string; subtotal: string; unit: string; flavors: string[] }[]> = {};

  if (orderIds.length === 0) return result;

  // ── Order Items ───────────────────────────────────────────────────────────
  const allOrderItems = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      productName: products.name,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      subtotal: orderItems.subtotal,
      unit: products.unit,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(inArray(orderItems.orderId, orderIds));

  // Fetch flavors for order items
  const orderItemIds = allOrderItems.map(i => i.id);
  let itemFlavors: Record<number, string[]> = {};
  if (orderItemIds.length > 0) {
    const flavorRows = await db
      .select({ orderItemId: orderItemFlavors.orderItemId, flavorName: orderItemFlavors.flavorName })
      .from(orderItemFlavors)
      .where(inArray(orderItemFlavors.orderItemId, orderItemIds));
    for (const f of flavorRows) {
      if (!itemFlavors[f.orderItemId]) itemFlavors[f.orderItemId] = [];
      itemFlavors[f.orderItemId].push(f.flavorName);
    }
  }

  for (const item of allOrderItems) {
    if (!result[item.orderId]) result[item.orderId] = [];
    const flavors = itemFlavors[item.id] ?? [];
    const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
    result[item.orderId].push({
      name: `${item.productName ?? "Produto"}${flavorStr}`,
      qty: item.quantity,
      price: `R$ ${parseFloat(item.unitPrice).toFixed(2).replace(".", ",")}`,
      subtotal: `R$ ${parseFloat(item.subtotal).toFixed(2).replace(".", ",")}`,
      unit: item.unit ?? "",
      flavors,
    });
  }

  // ── Minipizzas ────────────────────────────────────────────────────────────
  const mpRows = await db
    .select({
      id: orderMinipizzas.id,
      orderId: orderMinipizzas.orderId,
      quantity: orderMinipizzas.quantity,
      unitPrice: orderMinipizzas.unitPrice,
      subtotal: orderMinipizzas.subtotal,
      typeName: minipizzaTypes.name,
      typeUnits: minipizzaTypes.units,
    })
    .from(orderMinipizzas)
    .leftJoin(minipizzaTypes, eq(orderMinipizzas.minipizzaTypeId, minipizzaTypes.id))
    .where(inArray(orderMinipizzas.orderId, orderIds));

  const mpIds = mpRows.map(m => m.id);
  let mpFlavorMap: Record<number, string[]> = {};
  if (mpIds.length > 0) {
    const flavorRows = await db
      .select({ orderMinipizzaId: orderMinipizzaFlavors.orderMinipizzaId, flavorName: minipizzaFlavors.name })
      .from(orderMinipizzaFlavors)
      .leftJoin(minipizzaFlavors, eq(orderMinipizzaFlavors.minipizzaFlavorId, minipizzaFlavors.id))
      .where(inArray(orderMinipizzaFlavors.orderMinipizzaId, mpIds));
    for (const f of flavorRows) {
      if (!mpFlavorMap[f.orderMinipizzaId]) mpFlavorMap[f.orderMinipizzaId] = [];
      mpFlavorMap[f.orderMinipizzaId].push(f.flavorName ?? "");
    }
  }

  for (const mp of mpRows) {
    if (!result[mp.orderId]) result[mp.orderId] = [];
    const flavors = mpFlavorMap[mp.id] ?? [];
      const flavorStr = flavors.length > 0 ? ` (${flavors.join(", ")})` : "";
    result[mp.orderId].push({
      name: `Minipizza ${String(mp.typeName ?? "—")}${flavorStr}`,
      qty: mp.quantity,
      price: `R$ ${parseFloat(mp.unitPrice).toFixed(2).replace(".", ",")}`,
      subtotal: `R$ ${parseFloat(mp.subtotal).toFixed(2).replace(".", ",")}`,
      unit: `${mp.typeUnits ?? 0} un.`,
      flavors,
    });
  }

  // ── Jellies ───────────────────────────────────────────────────────────────
  const jRows = await db
    .select({
      orderId: orderJellies.orderId,
      flavorName: jellyFlavors.name,
      quantity: orderJellies.quantity,
      unitPrice: orderJellies.unitPrice,
      subtotal: orderJellies.subtotal,
    })
    .from(orderJellies)
    .leftJoin(jellyFlavors, eq(orderJellies.jellyFlavorId, jellyFlavors.id))
    .where(inArray(orderJellies.orderId, orderIds));

  for (const j of jRows) {
    if (!result[j.orderId]) result[j.orderId] = [];
    result[j.orderId].push({
      name: `Geleia ${j.flavorName ?? "—"}`,
      qty: j.quantity,
      price: `R$ ${parseFloat(j.unitPrice).toFixed(2).replace(".", ",")}`,
      subtotal: `R$ ${parseFloat(j.subtotal).toFixed(2).replace(".", ",")}`,
      unit: "",
      flavors: [],
    });
  }

  return result;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR");
}
function formatCurrency(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "R$ 0,00";
  return `R$ ${parseFloat(String(v)).toFixed(2).replace(".", ",")}`;
}

/**
 * Build a product summary string for an order
 */
function buildProductSummary(itemsMap: Record<number, any[]>, orderId: number): string {
  const items = itemsMap[orderId] || [];
  if (items.length === 0) return "—";
  return items.map(i => `${i.name}: ${i.qty}x`).join("; ");
}

/**
 * Build a detailed product string for Excel
 */
function buildProductDetails(itemsMap: Record<number, any[]>, orderId: number): string {
  const items = itemsMap[orderId] || [];
  if (items.length === 0) return "—";
  return items.map(i => `${i.name}: ${i.qty}x`).join("\n");
}

export const exportsRouter = router({
  // Returns base64-encoded Excel file WITH PRODUCTS
  ordersExcel: protectedProcedure
    .input(exportInputSchema)
    .mutation(async ({ input }) => {
      const rows = await fetchOrdersForExport(input);
      const orderIds = rows.map(o => o.id);
      const itemsMap = await fetchItemsForOrders(orderIds);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistema Integrarte";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet("Pedidos", {
        pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
      });

      const headerFill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2D6A4F" },
      };
      const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      const headerAlignment: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };

      sheet.columns = [
        { header: "Nº Pedido", key: "id", width: 12 },
        { header: "Data", key: "createdAt", width: 14 },
        { header: "Cliente", key: "customerName", width: 28 },
        { header: "Telefone", key: "customerPhone", width: 18 },
        { header: "Endereço", key: "deliveryAddress", width: 28 },
        { header: "Bairro", key: "customerNeighborhood", width: 20 },
        { header: "Cidade", key: "customerCity", width: 18 },
        { header: "Vendedor(a)", key: "launcherName", width: 22 },
        { header: "Forma de Entrega", key: "deliveryMethodName", width: 22 },
        { header: "Data de Entrega", key: "deliveryDate", width: 16 },
        { header: "Pagamento", key: "paymentMethod", width: 14 },
        { header: "Status Pedido", key: "status", width: 18 },
        { header: "Status Pagamento", key: "paymentStatus", width: 18 },
        { header: "Total", key: "totalAmount", width: 14 },
        { header: "Produtos", key: "products", width: 45 },
        { header: "Observações", key: "notes", width: 30 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = headerAlignment;
        cell.border = { bottom: { style: "thin", color: { argb: "FF1B4332" } } };
      });

      rows.forEach((o, idx) => {
        const row = sheet.addRow({
          id: o.id,
          createdAt: formatDate(o.createdAt),
          customerName: o.customerName ?? "",
          customerPhone: o.customerPhone ?? "",
          deliveryAddress: o.deliveryAddress ?? "",
          customerNeighborhood: o.customerNeighborhood ?? "",
          customerCity: o.customerCity ?? "",
          launcherName: o.launcherName ?? "",
          deliveryMethodName: o.deliveryMethodName ?? "",
          deliveryDate: formatDate(o.deliveryDate),
          paymentMethod: PAYMENT_METHOD_LABELS[o.paymentMethod] ?? o.paymentMethod,
          status: STATUS_LABELS[o.status] ?? o.status,
          paymentStatus: PAYMENT_STATUS_LABELS[o.paymentStatus] ?? o.paymentStatus,
          totalAmount: formatCurrency(o.totalAmount),
          products: buildProductDetails(itemsMap, o.id),
          notes: o.notes ?? "",
        });
        if (idx % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FFF4" } };
          });
        }
        row.eachCell((cell) => {
          cell.alignment = { vertical: "middle", wrapText: true };
        });
      });

      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      return {
        base64: Buffer.from(buffer).toString("base64"),
        filename: `pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }),

  // Returns base64-encoded PDF file WITH PRODUCTS
  ordersPdf: protectedProcedure
    .input(exportInputSchema)
    .mutation(async ({ input }) => {
      const rows = await fetchOrdersForExport(input);
      const orderIds = rows.map(o => o.id);
      const itemsMap = await fetchItemsForOrders(orderIds);

      return new Promise<{ base64: string; filename: string; mimeType: string }>((resolve, reject) => {
        const doc = new PDFDocument({
          size: "A3",
          layout: "landscape",
          margin: 30,
          info: { Title: "Relatório de Pedidos - Integrarte", Author: "Sistema Integrarte" },
        });

        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            base64: buffer.toString("base64"),
            filename: `pedidos_${new Date().toISOString().slice(0, 10)}.pdf`,
            mimeType: "application/pdf",
          });
        });
        doc.on("error", reject);

        const pageWidth = doc.page.width - 60;
        const green = "#2D6A4F";
        const lightGreen = "#D8F3DC";
        const darkText = "#1B1B1B";
        const mutedText = "#555555";

        // Header
        doc.rect(30, 30, pageWidth, 40).fill(green);
        doc.fillColor("#FFFFFF").fontSize(16).font("Helvetica-Bold")
          .text("Relatório de Pedidos — Integrarte", 40, 42, { width: pageWidth - 20 });

        const filterParts: string[] = [];
        if (input.dateFrom) filterParts.push(`De: ${formatDate(new Date(input.dateFrom))}`);
        if (input.dateTo) filterParts.push(`Até: ${formatDate(new Date(input.dateTo))}`);
        if (input.status) filterParts.push(`Status: ${STATUS_LABELS[input.status] ?? input.status}`);
        const subtitle = filterParts.length > 0 ? filterParts.join("   |   ") : "Todos os pedidos";

        doc.fillColor(mutedText).fontSize(9).font("Helvetica")
          .text(`Gerado em: ${new Date().toLocaleString("pt-BR")}   |   ${subtitle}   |   Total: ${rows.length} pedidos`,
            30, 78, { width: pageWidth });

        let y = 95;

        const cols = [
          { label: "Nº", width: 30 },
          { label: "Data", width: 50 },
          { label: "Cliente", width: 90 },
          { label: "Telefone", width: 65 },
          { label: "Vendedor(a)", width: 75 },
          { label: "Entrega", width: 70 },
          { label: "Status", width: 55 },
          { label: "Total", width: 55 },
          { label: "Produtos", width: 140 },
        ];

        const drawTableHeader = (yPos: number) => {
          doc.rect(30, yPos, pageWidth, 18).fill(green);
          let x = 30;
          doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
          for (const col of cols) {
            doc.text(col.label, x + 3, yPos + 5, { width: col.width - 4, ellipsis: true });
            x += col.width;
          }
          return yPos + 18;
        };

        y = drawTableHeader(y);

        rows.forEach((o, idx) => {
          if (y > doc.page.height - 60) {
            doc.addPage({ size: "A3", layout: "landscape", margin: 30 });
            y = 30;
            y = drawTableHeader(y);
          }

          const rowH = 16;
          if (idx % 2 === 0) {
            doc.rect(30, y, pageWidth, rowH).fill(lightGreen);
          }

          let x = 30;
          doc.fillColor(darkText).fontSize(7.5).font("Helvetica");
          const cells = [
            String(o.id),
            formatDate(o.createdAt),
            o.customerName ?? "",
            o.customerPhone ?? "",
            o.launcherName ?? "",
            o.deliveryMethodName ?? "",
            STATUS_LABELS[o.status] ?? o.status,
            formatCurrency(o.totalAmount),
            buildProductSummary(itemsMap, o.id),
          ];
          cells.forEach((text, ci) => {
            doc.text(text, x + 3, y + 4, { width: cols[ci].width - 6, ellipsis: true });
            x += cols[ci].width;
          });

          doc.rect(30, y, pageWidth, rowH).stroke("#CCCCCC");
          y += rowH;
        });

        // Summary
        y += 8;
        if (y > doc.page.height - 50) {
          doc.addPage({ size: "A3", layout: "landscape", margin: 30 });
          y = 30;
        }
        const totalRevenue = rows.reduce((acc, o) => acc + parseFloat(String(o.totalAmount ?? 0)), 0);
        const paidCount = rows.filter(o => o.status === "paid").length;
        const pendingCount = rows.filter(o => o.paymentStatus === "pending" && o.status !== "cancelled").length;

        doc.rect(30, y, pageWidth, 28).fill("#F0FFF4");
        doc.fillColor(green).fontSize(9).font("Helvetica-Bold")
          .text(`Total de pedidos: ${rows.length}`, 40, y + 5)
          .text(`Pagos: ${paidCount}`, 180, y + 5)
          .text(`Pendentes: ${pendingCount}`, 280, y + 5)
          .text(`Receita total: ${formatCurrency(totalRevenue)}`, 400, y + 5);

        doc.end();
      });
    }),

  // Upload Excel to storage and return public URL (Google Drive-like behavior)
  ordersExcelToStorage: protectedProcedure
    .input(exportInputSchema)
    .mutation(async ({ input }) => {
      const rows = await fetchOrdersForExport(input);
      const orderIds = rows.map(o => o.id);
      const itemsMap = await fetchItemsForOrders(orderIds);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistema Integrarte";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet("Pedidos", {
        pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
      });

      const headerFill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2D6A4F" },
      };
      const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      const headerAlignment: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };

      sheet.columns = [
        { header: "Nº Pedido", key: "id", width: 12 },
        { header: "Data", key: "createdAt", width: 14 },
        { header: "Cliente", key: "customerName", width: 28 },
        { header: "Telefone", key: "customerPhone", width: 18 },
        { header: "Endereço", key: "deliveryAddress", width: 28 },
        { header: "Bairro", key: "customerNeighborhood", width: 20 },
        { header: "Cidade", key: "customerCity", width: 18 },
        { header: "Vendedor(a)", key: "launcherName", width: 22 },
        { header: "Forma de Entrega", key: "deliveryMethodName", width: 22 },
        { header: "Data de Entrega", key: "deliveryDate", width: 16 },
        { header: "Pagamento", key: "paymentMethod", width: 14 },
        { header: "Status Pedido", key: "status", width: 18 },
        { header: "Status Pagamento", key: "paymentStatus", width: 18 },
        { header: "Total", key: "totalAmount", width: 14 },
        { header: "Produtos", key: "products", width: 45 },
        { header: "Observações", key: "notes", width: 30 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = headerAlignment;
        cell.border = { bottom: { style: "thin", color: { argb: "FF1B4332" } } };
      });

      rows.forEach((o, idx) => {
        const row = sheet.addRow({
          id: o.id,
          createdAt: formatDate(o.createdAt),
          customerName: o.customerName ?? "",
          customerPhone: o.customerPhone ?? "",
          deliveryAddress: o.deliveryAddress ?? "",
          customerNeighborhood: o.customerNeighborhood ?? "",
          customerCity: o.customerCity ?? "",
          launcherName: o.launcherName ?? "",
          deliveryMethodName: o.deliveryMethodName ?? "",
          deliveryDate: formatDate(o.deliveryDate),
          paymentMethod: PAYMENT_METHOD_LABELS[o.paymentMethod] ?? o.paymentMethod,
          status: STATUS_LABELS[o.status] ?? o.status,
          paymentStatus: PAYMENT_STATUS_LABELS[o.paymentStatus] ?? o.paymentStatus,
          totalAmount: formatCurrency(o.totalAmount),
          products: buildProductDetails(itemsMap, o.id),
          notes: o.notes ?? "",
        });
        if (idx % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FFF4" } };
          });
        }
        row.eachCell((cell) => {
          cell.alignment = { vertical: "middle", wrapText: true };
        });
      });

      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      const bufferData = Buffer.from(buffer);

      const dateStr = new Date().toISOString().slice(0, 10);
      const stored = await storagePut(
        `exports/pedidos_${dateStr}_${Date.now()}.xlsx`,
        bufferData,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      const signedUrl = await storageGetSignedUrl(stored.key);

      return {
        url: signedUrl,
        filename: `pedidos_${dateStr}.xlsx`,
        message: "Planilha salva com sucesso no armazenamento do sistema!",
      };
    }),

  // Upload backup JSON to storage
  databaseBackupToStorage: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem fazer backup." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { productCategories, orderStatusHistory, deliveryRoutes, routeOrders, deliveryRecords, paymentRecords } =
        await import("../../drizzle/schema");

      const [allUsers, allCustomers, allOrders, allOrderItems, allProducts, allCategories,
        allDeliveryMethods, allMinipizzaTypes, allMinipizzaFlavors, allJellyFlavors,
        allOrderMinipizzas, allOrderMinipizzaFlavors, allOrderJellies, allOrderStatusHistory,
        allProductFlavors, allOrderItemFlavors, allDeliveryRoutes, allRouteOrders, allDeliveryRecords, allPaymentRecords
      ] = await Promise.all([
        db.select().from(users),
        db.select().from(customers),
        db.select().from(orders),
        db.select().from(orderItems),
        db.select().from(products),
        db.select().from(productCategories),
        db.select().from(deliveryMethods),
        db.select().from(minipizzaTypes),
        db.select().from(minipizzaFlavors),
        db.select().from(jellyFlavors),
        db.select().from(orderMinipizzas),
        db.select().from(orderMinipizzaFlavors),
        db.select().from(orderJellies),
        db.select().from(orderStatusHistory),
        db.select().from(productFlavors),
        db.select().from(orderItemFlavors),
        db.select().from(deliveryRoutes),
        db.select().from(routeOrders),
        db.select().from(deliveryRecords),
        db.select().from(paymentRecords),
      ]);

      const backup = {
        exportedAt: new Date().toISOString(),
        system: "Integrarte Vendas",
        tables: {
          users: allUsers.map(u => ({ ...u, passwordHash: undefined })),
          customers: allCustomers,
          orders: allOrders,
          orderItems: allOrderItems,
          products: allProducts,
          productCategories: allCategories,
          productFlavors: allProductFlavors,
          deliveryMethods: allDeliveryMethods,
          minipizzaTypes: allMinipizzaTypes,
          minipizzaFlavors: allMinipizzaFlavors,
          jellyFlavors: allJellyFlavors,
          orderMinipizzas: allOrderMinipizzas,
          orderMinipizzaFlavors: allOrderMinipizzaFlavors,
          orderJellies: allOrderJellies,
          orderItemFlavors: allOrderItemFlavors,
          orderStatusHistory: allOrderStatusHistory,
          deliveryRoutes: allDeliveryRoutes,
          routeOrders: allRouteOrders,
          deliveryRecords: allDeliveryRecords,
          paymentRecords: allPaymentRecords,
        },
      };

      const jsonStr = JSON.stringify(backup, null, 2);
      const bufferData = Buffer.from(jsonStr);

      const dateStr = new Date().toISOString().slice(0, 10);
      const stored = await storagePut(
        `backups/backup_integrarte_${dateStr}_${Date.now()}.json`,
        bufferData,
        "application/json"
      );

      const signedUrl = await storageGetSignedUrl(stored.key);

      return {
        url: signedUrl,
        filename: `backup_integrarte_${dateStr}.json`,
        message: "Backup salvo com sucesso no armazenamento do sistema!",
      };
    }),

  // Export customers list as Excel
  customersExcel: protectedProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db.select().from(customers).orderBy(customers.name);

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Clientes");

      const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D6A4F" } };
      const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };

      sheet.columns = [
        { header: "Nome", key: "name", width: 30 },
        { header: "Telefone", key: "phone", width: 18 },
        { header: "Rua", key: "street", width: 28 },
        { header: "Número", key: "number", width: 10 },
        { header: "Bairro", key: "neighborhood", width: 22 },
        { header: "Cidade", key: "city", width: 20 },
        { header: "CEP", key: "zipCode", width: 12 },
        { header: "Referência", key: "locationReference", width: 30 },
        { header: "Cadastrado em", key: "createdAt", width: 16 },
      ];

      sheet.getRow(1).eachCell((cell) => {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
      sheet.getRow(1).height = 22;

      rows.forEach((c, idx) => {
        const row = sheet.addRow({
          name: c.name,
          phone: c.phone,
          street: c.street ?? "",
          number: c.number ?? "",
          neighborhood: c.neighborhood ?? "",
          city: c.city ?? "",
          zipCode: c.zipCode ?? "",
          locationReference: c.locationReference ?? "",
          createdAt: formatDate(c.createdAt),
        });
        if (idx % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FFF4" } };
          });
        }
      });

      sheet.views = [{ state: "frozen", ySplit: 1 }];
      const buffer = await workbook.xlsx.writeBuffer();
      return {
        base64: Buffer.from(buffer).toString("base64"),
        filename: `clientes_${new Date().toISOString().slice(0, 10)}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }),

  // ─── GOOGLE SHEETS INTEGRATION ─────────────────────────────────────────────────

  /** Save orders to Google Sheets */
  ordersToGoogleSheets: protectedProcedure
    .input(exportInputSchema)
    .mutation(async ({ input }) => {
      if (!googleSheets.isConfigured()) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Google Sheets não configurado. Adicione as variáveis de ambiente GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY e GOOGLE_SHEETS_SPREADSHEET_ID.",
        });
      }

      const rows = await fetchOrdersForExport(input);
      const orderIds = rows.map(o => o.id);
      const itemsMap = await fetchItemsForOrders(orderIds);

      const productSummaryMap: Record<number, string> = {};
      for (const order of rows) {
        const items = itemsMap[order.id] || [];
        productSummaryMap[order.id] = items.length > 0
          ? items.map(i => `${i.name} (${i.qty}x)`).join("; ")
          : "—";
      }

      const ordersForSheets = rows.map(o => ({
        id: o.id,
        createdAt: o.createdAt,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        deliveryAddress: o.deliveryAddress,
        customerNeighborhood: o.customerNeighborhood,
        customerCity: o.customerCity,
        launcherName: o.launcherName,
        deliveryMethodName: o.deliveryMethodName,
        deliveryDate: o.deliveryDate,
        paymentMethod: o.paymentMethod,
        status: o.status,
        paymentStatus: o.paymentStatus,
        totalAmount: o.totalAmount,
        products: productSummaryMap[o.id],
        notes: o.notes,
      }));

      // Use a dynamic sheet title based on date
      const dateStr = new Date().toISOString().slice(0, 10);
      const sheetTitle = `Pedidos ${dateStr}`;

      const spreadsheetUrl = await googleSheets.writeOrders(ordersForSheets, sheetTitle);

      return {
        url: spreadsheetUrl,
        sheetTitle,
        count: rows.length,
        message: `${rows.length} pedidos salvos no Google Sheets com sucesso!`,
      };
    }),

  /** Save backup summary to Google Sheets */
  backupToGoogleSheets: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem fazer backup." });
      }
      if (!googleSheets.isConfigured()) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Google Sheets não configurado. Adicione as variáveis de ambiente GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY e GOOGLE_SHEETS_SPREADSHEET_ID.",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { productCategories, orderStatusHistory, deliveryRoutes, routeOrders, deliveryRecords, paymentRecords, productFlavors: pf, orderItemFlavors: oif } =
        await import("../../drizzle/schema");

      const [allUsers, allCustomers, allOrders, allProducts, allCategories, allFlavors, allOrderItems] =
        await Promise.all([
          db.select().from(users),
          db.select().from(customers),
          db.select().from(orders),
          db.select().from(products),
          db.select().from(productCategories),
          db.select().from(pf),
          db.select().from(orderItems),
        ]);

      const totalRevenue = allOrders.reduce(
        (acc: number, o) => acc + parseFloat(String(o.totalAmount ?? 0)),
        0
      );

      const summary = {
        users: allUsers.length,
        customers: allCustomers.length,
        products: allProducts.length,
        orders: allOrders.length,
        totalRevenue: formatCurrency(totalRevenue),
        exportedAt: new Date().toISOString(),
      };

      const spreadsheetUrl = await googleSheets.writeBackup(summary);

      return {
        url: spreadsheetUrl,
        summary,
        message: "Resumo do backup salvo no Google Sheets com sucesso!",
      };
    }),

  /** Save customer list to Google Sheets */
  customersToGoogleSheets: protectedProcedure
    .mutation(async () => {
      if (!googleSheets.isConfigured()) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Google Sheets não configurado. Adicione as variáveis de ambiente GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY e GOOGLE_SHEETS_SPREADSHEET_ID.",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db.select().from(customers).orderBy(customers.name);
      const spreadsheetUrl = await googleSheets.writeCustomerList(rows);

      return {
        url: spreadsheetUrl,
        count: rows.length,
        message: `${rows.length} clientes salvos no Google Sheets com sucesso!`,
      };
    }),
});
