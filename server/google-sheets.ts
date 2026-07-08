/**
 * Google Sheets API client for saving order data to spreadsheets.
 *
 * Uses Google Service Account credentials for server-side authentication.
 *
 * Required env variables:
 *   GOOGLE_SHEETS_CLIENT_EMAIL  - Service account email
 *   GOOGLE_SHEETS_PRIVATE_KEY   - Service account private key (PKCS8 PEM format, with newlines)
 *   GOOGLE_SHEETS_SPREADSHEET_ID - The spreadsheet ID to write to
 *
 * Setup instructions:
 *   1. Go to https://console.cloud.google.com/
 *   2. Create a project (or use existing)
 *   3. Enable "Google Sheets API"
 *   4. Create a Service Account with "Editor" role on the spreadsheet
 *   5. Download the JSON key file
 *   6. Set env vars from the key file
 *   7. Share the spreadsheet with the service account email
 */

import { google } from "googleapis";
import { TRPCError } from "@trpc/server";

const ENV = {
  clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL ?? "",
  privateKey: (process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "",
};

function getAuth() {
  if (!ENV.clientEmail || !ENV.privateKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Credenciais do Google Sheets não configuradas. Configure GOOGLE_SHEETS_CLIENT_EMAIL e GOOGLE_SHEETS_PRIVATE_KEY.",
    });
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: ENV.clientEmail,
      private_key: ENV.privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return auth;
}

/**
 * Find or create a sheet (tab) within the spreadsheet.
 * Returns the sheet title (which may have been auto-generated).
 */
async function ensureSheet(auth: InstanceType<typeof google.auth.GoogleAuth>, title: string) {
  const sheets = google.sheets({ version: "v4", auth });

  // Check if sheet already exists
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: ENV.spreadsheetId,
    fields: "sheets.properties",
  });

  const existing = meta.data.sheets?.find((s) => s.properties?.title === title);
  if (existing && existing.properties) {
    return existing.properties.title;
  }

  // Create new sheet
  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ENV.spreadsheetId,
    requestBody: {
      requests: [{
        addSheet: {
          properties: {
            title,
            index: 0,
          },
        },
      }],
    },
  });

  const newSheet = response.data.replies?.[0]?.addSheet?.properties;
  if (!newSheet) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar aba no Google Sheets." });
  }

  // Rename to avoid Google auto-naming issues
  const finalTitle = newSheet.title ?? title;

  // Update title to match exactly
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ENV.spreadsheetId,
    requestBody: {
      requests: [{
        updateSheetProperties: {
          properties: { sheetId: newSheet.sheetId, title },
          fields: "title",
        },
      }],
    },
  });

  return title;
}

/**
 * Write a header row with bold formatting and auto-resize columns.
 */
async function writeHeader(auth: InstanceType<typeof google.auth.GoogleAuth>, range: string, headers: string[]) {
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId: ENV.spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [headers],
    },
  });

  // Bold header formatting
  const startCol = range.includes(":")
    ? range.split(":")[0].replace(/[0-9]/g, "")
    : range.replace(/[0-9]/g, "");
  const startRow = parseInt(range.includes(":") ? range.split(":")[0].replace(/[A-Za-z]/g, "") : range.replace(/[A-Za-z]/g, ""));
  const endRow = startRow;
  const endColLetter = String.fromCharCode(startCol.charCodeAt(0) + headers.length - 1);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ENV.spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: 0,
              startRowIndex: startRow - 1,
              endRowIndex: startRow,
              startColumnIndex: 0,
              endColumnIndex: headers.length,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.18, green: 0.42, blue: 0.31 },
                horizontalAlignment: "CENTER",
              },
              effectiveFormat: {},
              userEnteredValue: {},
            },
            fields: "userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0,
              startRowIndex: startRow - 1,
              endRowIndex: startRow,
              startColumnIndex: 0,
              endColumnIndex: headers.length,
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true,
                  fontSize: 11,
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                },
              },
            },
            fields: "userEnteredFormat.textFormat(bold,fontSize,foregroundColor)",
          },
        },
      ],
    },
  });
}

/**
 * Append rows to a sheet and auto-resize columns.
 */
async function appendRows(
  auth: InstanceType<typeof google.auth.GoogleAuth>,
  sheetTitle: string,
  headers: string[],
  rows: string[][],
) {
  const sheets = google.sheets({ version: "v4", auth });

  // Get the last row index to know where to write
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: ENV.spreadsheetId,
    range: `${sheetTitle}!A1:ZZ`,
  });

  const startRow = existing.data.values ? existing.data.values.length + 1 : 1;

  // Write the data
  const range = `${sheetTitle}!A${startRow}:ZZ`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: ENV.spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [headers, ...rows],
    },
  });

  // Auto-resize columns
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ENV.spreadsheetId,
    requestBody: {
      requests: headers.map((_, i) => ({
        autoResizeDimensions: {
          dimensions: {
            sheetId: 0,
            dimension: "COLUMNS",
            startIndex: i,
            endIndex: i + 1,
          },
        },
      })),
    },
  });
}

export const googleSheets = {
  isConfigured: () => !!(ENV.clientEmail && ENV.privateKey && ENV.spreadsheetId),
  getSpreadsheetUrl: () =>
    ENV.spreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${ENV.spreadsheetId}`
      : null,
  writeOrders,
  writeBackup,
  writeCustomerList,
  appendOrder,
};

/**
 * Append a single order to the Google Sheets spreadsheet.
 */
async function appendOrder(order: any, sheetTitle: string = "Pedidos") {
  if (!ENV.spreadsheetId) return;

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const title = await ensureSheet(auth, sheetTitle);

  const fmtDate = (d: Date | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");
  const fmtCurrency = (v: string | null) => (v ? `R$ ${parseFloat(v).toFixed(2).replace(".", ",")}` : "R$ 0,00");

  const statusLabels: Record<string, string> = {
    production: "Em produção",
    in_route: "Em rota",
    delivered: "Entregue",
    paid: "Pago",
    cancelled: "Cancelado",
  };
  const paymentStatusLabels: Record<string, string> = {
    pending: "Pendente",
    paid: "Pago",
    partial: "Parcial",
    cancelled: "Cancelado",
  };
  const paymentMethodLabels: Record<string, string> = { cash: "Dinheiro", pix: "PIX" };

  const row = [
    String(order.id),
    fmtDate(order.createdAt),
    order.customerName ?? "",
    order.customerPhone ?? "",
    order.deliveryAddress ?? "",
    order.customerNeighborhood ?? "",
    order.customerCity ?? "",
    order.launcherName ?? "",
    order.deliveryMethodName ?? "",
    fmtDate(order.deliveryDate),
    paymentMethodLabels[order.paymentMethod] ?? order.paymentMethod,
    statusLabels[order.status] ?? order.status,
    paymentStatusLabels[order.paymentStatus] ?? order.paymentStatus,
    fmtCurrency(order.totalAmount),
    order.products,
    order.notes ?? "",
  ];

  // Get current values to see if we need to add headers
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: ENV.spreadsheetId,
    range: `${title}!A1:A1`,
  });

  const values = [];
  if (!existing.data.values || existing.data.values.length === 0) {
    values.push([
      "Nº Pedido",
      "Data",
      "Cliente",
      "Telefone",
      "Endereço",
      "Bairro",
      "Cidade",
      "Vendedor(a)",
      "Forma de Entrega",
      "Data de Entrega",
      "Pagamento",
      "Status Pedido",
      "Status Pagamento",
      "Total",
      "Produtos",
      "Observações",
    ]);
  }
  values.push(row);

  await sheets.spreadsheets.values.append({
    spreadsheetId: ENV.spreadsheetId,
    range: `${title}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  // Auto-resize columns
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ENV.spreadsheetId,
    requestBody: {
      requests: [
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: 0, // Note: This might need the actual sheetId if not the first one
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: 16,
            },
          },
        },
      ],
    },
  });
}

/**
 * Write order data to Google Sheets (creates new tab or overwrites).
 */
async function writeOrders(
  orders: Array<{
    id: number;
    createdAt: Date;
    customerName: string | null;
    customerPhone: string | null;
    deliveryAddress: string | null;
    customerNeighborhood: string | null;
    customerCity: string | null;
    launcherName: string | null;
    deliveryMethodName: string | null;
    deliveryDate: Date | null;
    paymentMethod: string;
    status: string;
    paymentStatus: string;
    totalAmount: string | null;
    products: string;
    notes: string | null;
  }>,
  sheetTitle: string = "Pedidos",
) {
  if (!ENV.spreadsheetId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "GOOGLE_SHEETS_SPREADSHEET_ID não configurado." });
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const title = await ensureSheet(auth, sheetTitle);

  // Clear existing data in the sheet
  await sheets.spreadsheets.values.clear({
    spreadsheetId: ENV.spreadsheetId,
    range: `${title}!A1:ZZ`,
  });

  const headers = [
    "Nº Pedido", "Data", "Cliente", "Telefone", "Endereço", "Bairro", "Cidade",
    "Vendedor(a)", "Forma de Entrega", "Data de Entrega",
    "Pagamento", "Status Pedido", "Status Pagamento", "Total",
    "Produtos", "Observações",
  ];

  const fmtDate = (d: Date | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "";
  const fmtCurrency = (v: string | null) => v ? `R$ ${parseFloat(v).toFixed(2).replace(".", ",")}` : "R$ 0,00";

  const statusLabels: Record<string, string> = {
    production: "Em produção", in_route: "Em rota", delivered: "Entregue",
    paid: "Pago", cancelled: "Cancelado",
  };
  const paymentStatusLabels: Record<string, string> = {
    pending: "Pendente", paid: "Pago", partial: "Parcial", cancelled: "Cancelado",
  };
  const paymentMethodLabels: Record<string, string> = { cash: "Dinheiro", pix: "PIX" };

  const rows = orders.map((o) => [
    String(o.id),
    fmtDate(o.createdAt),
    o.customerName ?? "",
    o.customerPhone ?? "",
    o.deliveryAddress ?? "",
    o.customerNeighborhood ?? "",
    o.customerCity ?? "",
    o.launcherName ?? "",
    o.deliveryMethodName ?? "",
    fmtDate(o.deliveryDate),
    paymentMethodLabels[o.paymentMethod] ?? o.paymentMethod,
    statusLabels[o.status] ?? o.status,
    paymentStatusLabels[o.paymentStatus] ?? o.paymentStatus,
    fmtCurrency(o.totalAmount),
    o.products,
    o.notes ?? "",
  ]);

  // Write header first (row 1)
  await sheets.spreadsheets.values.update({
    spreadsheetId: ENV.spreadsheetId,
    range: `${title}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] },
  });

  // Bold/format header
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ENV.spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.176, green: 0.416, blue: 0.31 },
                horizontalAlignment: "CENTER",
              },
            },
            fields: "userEnteredFormat(backgroundColor,horizontalAlignment)",
          },
        },
        {
          repeatCell: {
            range: { startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: "userEnteredFormat.textFormat",
          },
        },
      ],
    },
  });

  // Write data rows starting at row 2
  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: ENV.spreadsheetId,
      range: `${title}!A2`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });
  }

  // Auto-resize columns
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ENV.spreadsheetId,
    requestBody: {
      requests: headers.map((_, i) => ({
        autoResizeDimensions: {
          dimensions: { dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        },
      })),
    },
  });

  // Freeze top row
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ENV.spreadsheetId,
    requestBody: {
      requests: [{
        updateSheetProperties: {
          properties: {
            gridProperties: { frozenRowCount: 1 },
          },
          fields: "gridProperties.frozenRowCount",
        },
      }],
    },
  });

  return `https://docs.google.com/spreadsheets/d/${ENV.spreadsheetId}`;
}

/**
 * Write a full database backup summary to Google Sheets.
 */
async function writeBackup(summary: {
  users: number;
  customers: number;
  products: number;
  orders: number;
  totalRevenue: string;
  exportedAt: string;
}) {
  if (!ENV.spreadsheetId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "GOOGLE_SHEETS_SPREADSHEET_ID não configurado." });
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const title = await ensureSheet(auth, "Backup");

  // Clear existing
  await sheets.spreadsheets.values.clear({
    spreadsheetId: ENV.spreadsheetId,
    range: `${title}!A1:ZZ`,
  });

  const headers = ["Métrica", "Valor"];
  const rows = [
    ["Data do Backup", new Date(summary.exportedAt).toLocaleString("pt-BR")],
    ["Usuários", String(summary.users)],
    ["Clientes", String(summary.customers)],
    ["Produtos", String(summary.products)],
    ["Pedidos", String(summary.orders)],
    ["Receita Total", summary.totalRevenue],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: ENV.spreadsheetId,
    range: `${title}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers, ...rows] },
  });

  // Format header
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ENV.spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.176, green: 0.416, blue: 0.31 },
                horizontalAlignment: "CENTER",
              },
            },
            fields: "userEnteredFormat(backgroundColor,horizontalAlignment)",
          },
        },
        {
          repeatCell: {
            range: { startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: "userEnteredFormat.textFormat",
          },
        },
      ],
    },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ENV.spreadsheetId,
    requestBody: {
      requests: [
        { autoResizeDimensions: { dimensions: { dimension: "COLUMNS", startIndex: 0, endIndex: 1 } } },
        { autoResizeDimensions: { dimensions: { dimension: "COLUMNS", startIndex: 1, endIndex: 2 } } },
      ],
    },
  });

  return `https://docs.google.com/spreadsheets/d/${ENV.spreadsheetId}`;
}

/**
 * Write customer list to Google Sheets.
 */
async function writeCustomerList(customers: Array<{
  name: string;
  phone: string;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  zipCode: string | null;
  locationReference: string | null;
  createdAt: Date | null;
}>) {
  if (!ENV.spreadsheetId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "GOOGLE_SHEETS_SPREADSHEET_ID não configurado." });
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const title = await ensureSheet(auth, "Clientes");

  await sheets.spreadsheets.values.clear({
    spreadsheetId: ENV.spreadsheetId,
    range: `${title}!A1:ZZ`,
  });

  const headers = ["Nome", "Telefone", "Rua", "Número", "Bairro", "Cidade", "CEP", "Referência", "Cadastrado em"];

  const rows = customers.map((c) => [
    c.name,
    c.phone,
    c.street ?? "",
    c.number ?? "",
    c.neighborhood ?? "",
    c.city ?? "",
    c.zipCode ?? "",
    c.locationReference ?? "",
    c.createdAt ? new Date(c.createdAt).toLocaleDateString("pt-BR") : "",
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: ENV.spreadsheetId,
    range: `${title}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers, ...rows] },
  });

  // Format header
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ENV.spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.176, green: 0.416, blue: 0.31 },
                horizontalAlignment: "CENTER",
              },
            },
            fields: "userEnteredFormat(backgroundColor,horizontalAlignment)",
          },
        },
        {
          repeatCell: {
            range: { startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: "userEnteredFormat.textFormat",
          },
        },
      ],
    },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ENV.spreadsheetId,
    requestBody: {
      requests: headers.map((_, i) => ({
        autoResizeDimensions: { dimensions: { dimension: "COLUMNS", startIndex: i, endIndex: i + 1 } },
      })),
    },
  });

  return `https://docs.google.com/spreadsheets/d/${ENV.spreadsheetId}`;
}
