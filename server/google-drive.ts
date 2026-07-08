import { google } from "googleapis";
import { TRPCError } from "@trpc/server";
import PDFDocument from "pdfkit";
import { Readable } from "stream";

const ENV = {
  clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL ?? "",
  privateKey: (process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  folderId: process.env.GOOGLE_DRIVE_FOLDER_ID ?? "",
};

function getAuth() {
  if (!ENV.clientEmail || !ENV.privateKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Credenciais do Google não configuradas.",
    });
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: ENV.clientEmail,
      private_key: ENV.privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
}

/**
 * Generates a simple PDF receipt buffer using PDFKit
 */
async function generateReceiptPdf(order: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(20).text("RECIBO DE PEDIDO", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Pedido: #${order.id}`, { align: "right" });
    doc.text(`Data: ${new Date(order.createdAt).toLocaleDateString("pt-BR")}`, { align: "right" });
    doc.moveDown();

    // Customer Info
    doc.fontSize(14).text("DADOS DO CLIENTE", { underline: true });
    doc.fontSize(12).text(`Nome: ${order.customerName}`);
    doc.text(`Telefone: ${order.customerPhone}`);
    doc.text(`Endereço: ${order.customerStreet}, ${order.customerNumber}`);
    if (order.customerComplement) doc.text(`Complemento: ${order.customerComplement}`);
    doc.text(`Bairro: ${order.customerNeighborhood}`);
    doc.text(`Cidade: ${order.customerCity}`);
    doc.moveDown();

    // Order Info
    doc.fontSize(14).text("DETALHES DA ENTREGA", { underline: true });
    doc.fontSize(12).text(`Método: ${order.deliveryMethodName}`);
    doc.text(`Data Entrega: ${order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("pt-BR") : "—"}`);
    doc.text(`Pagamento: ${order.paymentMethod === "pix" ? "PIX" : "Dinheiro"}`);
    doc.moveDown();

    // Products
    doc.fontSize(14).text("PRODUTOS", { underline: true });
    doc.fontSize(10).text(order.products || "—");
    doc.moveDown();

    // Total
    doc.fontSize(16).text(`VALOR TOTAL: R$ ${parseFloat(order.totalAmount).toFixed(2).replace(".", ",")}`, { align: "right" });

    doc.end();
  });
}

/**
 * Uploads a PDF receipt to Google Drive
 */
export async function uploadReceiptToDrive(order: any) {
  if (!ENV.folderId) {
    console.log("[GoogleDrive] No folder ID configured, skipping upload.");
    return;
  }

  try {
    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    
    const pdfBuffer = await generateReceiptPdf(order);
    const fileName = `Recibo_Pedido_${order.id}_${order.customerName.replace(/\s+/g, "_")}.pdf`;

    const fileMetadata = {
      name: fileName,
      parents: [ENV.folderId],
    };

    const media = {
      mimeType: "application/pdf",
      body: Readable.from(pdfBuffer),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, webViewLink",
    });

    console.log(`[GoogleDrive] Receipt uploaded: ${response.data.id}`);
    return response.data.webViewLink;
  } catch (error: any) {
    console.error("[GoogleDrive] Error uploading receipt:", error.message);
  }
}
