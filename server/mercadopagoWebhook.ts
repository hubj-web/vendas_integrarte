/**
 * Webhook do Mercado Pago para a Loja Pública.
 * Configurado na sua conta MP (ou automaticamente via notification_url do
 * pagamento) apontando para: {APP_URL}/api/webhooks/mercadopago
 *
 * O Mercado Pago manda notificações tanto para pagamentos aprovados na hora
 * (PIX/cartão) quanto para mudanças de status posteriores — por isso este
 * endpoint sempre BUSCA o pagamento na API do MP (nunca confia no payload da
 * notificação em si) antes de decidir o que fazer.
 */
import type { Express } from "express";
import { eq } from "drizzle-orm";
import { orders, storeOrderPayments } from "../drizzle/schema";
import { getDb } from "./db";
import { getMercadoPagoPayment, mercadoPagoConfigured } from "./mercadopago";
import { buscarLotesEstoque, descontarLotesEstoque } from "./routers/seller";

function mapMpStatus(mpStatus: string | undefined): "pending" | "approved" | "rejected" | "cancelled" | "expired" {
  switch (mpStatus) {
    case "approved": return "approved";
    case "rejected": return "rejected";
    case "cancelled": return "cancelled";
    case "in_process":
    case "pending": return "pending";
    default: return "expired";
  }
}

export function registerMercadoPagoWebhook(app: Express) {
  app.post("/api/webhooks/mercadopago", async (req, res) => {
    // Responde 200 rápido sempre que possível — o MP reenvia notificações que
    // não recebem 2xx, então erros de negócio não devem virar 4xx/5xx aqui.
    try {
      if (!mercadoPagoConfigured()) return res.status(200).json({ ignored: true });

      const paymentId = req.body?.data?.id || req.query["data.id"] || req.body?.id;
      const type = req.body?.type || req.query.type;
      if (!paymentId || (type && type !== "payment")) {
        return res.status(200).json({ ignored: true });
      }

      const payment = await getMercadoPagoPayment(String(paymentId));
      const orderId = Number(payment.external_reference);
      if (!orderId) return res.status(200).json({ ignored: true });

      const db = await getDb();
      if (!db) return res.status(200).json({ ignored: true });

      const [existingPayment] = await db.select().from(storeOrderPayments).where(eq(storeOrderPayments.orderId, orderId)).limit(1);
      if (!existingPayment) return res.status(200).json({ ignored: true });

      const wasAlreadyApproved = existingPayment.status === "approved";
      const newStatus = mapMpStatus(payment.status);

      await db.update(storeOrderPayments).set({
        status: newStatus,
        mpPaymentId: String(payment.id),
        approvedAt: newStatus === "approved" ? new Date() : existingPayment.approvedAt,
      }).where(eq(storeOrderPayments.orderId, orderId));

      if (newStatus === "approved" && !wasAlreadyApproved) {
        await db.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, orderId));

        // Desconta o estoque agora que o pagamento foi confirmado (evita
        // descontar duas vezes graças ao guard `!wasAlreadyApproved` acima).
        const { orderItems, orderItemFlavors } = await import("../drizzle/schema");
        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        for (const item of items) {
          const flavorRows = await db.select({ productFlavorId: orderItemFlavors.productFlavorId })
            .from(orderItemFlavors).where(eq(orderItemFlavors.orderItemId, item.id));
          const lotes = await buscarLotesEstoque(db, item.productId, flavorRows.map(f => f.productFlavorId));
          await descontarLotesEstoque(db, lotes, item.quantity);
        }
      } else if ((newStatus === "rejected" || newStatus === "cancelled" || newStatus === "expired") && !wasAlreadyApproved) {
        await db.update(orders).set({ status: "cancelled", cancelReason: `Pagamento ${newStatus} no Mercado Pago` }).where(eq(orders.id, orderId));
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Erro no webhook do Mercado Pago:", err);
      // Ainda assim 200 — evita loop de reenvio infinito por erro nosso;
      // o log acima é o que importa para investigar.
      return res.status(200).json({ error: true });
    }
  });
}
