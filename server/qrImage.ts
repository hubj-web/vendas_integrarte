/**
 * Serve o QR code do recibo/ingresso como uma imagem PNG de verdade (URL
 * pública), em vez de embutir base64 direto no HTML do e-mail — vários
 * clientes de e-mail (principalmente Outlook) bloqueiam ou não renderizam
 * imagens base64 embutidas, então uma URL de imagem de verdade é bem mais
 * confiável.
 */
import type { Express } from "express";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { orders } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

export function registerQrImageRoute(app: Express) {
  app.get("/api/qr/:ticketCode.png", async (req, res) => {
    const { ticketCode } = req.params;
    const db = await getDb();
    if (!db) return res.status(500).end();

    const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ticketCode, ticketCode)).limit(1);
    if (!order) return res.status(404).end();

    const receiptUrl = `${ENV.appUrl}/loja/r/${ticketCode}`;
    const png = await QRCode.toBuffer(receiptUrl, { errorCorrectionLevel: "M", margin: 1, width: 400 });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(png);
  });
}
