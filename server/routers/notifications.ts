import type { Request, Response } from "express";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "../db";
import { orders, customers } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";
import { sdk } from "../_core/sdk";

/**
 * Handler for the scheduled cron job that checks for overdue payments.
 * Triggered by Manus Heartbeat at /api/scheduled/overdue-payments
 * Alerts the admin when orders have been delivered for more than X days without payment confirmation.
 */
export async function overduePaymentsHandler(req: Request, res: Response) {
  try {
    // Authenticate the cron request
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }

    // Find orders delivered more than 3 days ago with pending payment
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 3);

    const overdueOrders = await db
      .select({
        id: orders.id,
        totalAmount: orders.totalAmount,
        deliveryDate: orders.deliveryDate,
        updatedAt: orders.updatedAt,
        customerName: customers.name,
        customerPhone: customers.phone,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(
        and(
          eq(orders.status, "delivered"),
          eq(orders.paymentStatus, "pending"),
          lt(orders.updatedAt, threshold)
        )
      );

    if (overdueOrders.length === 0) {
      return res.json({ ok: true, message: "No overdue payments found" });
    }

    // Build notification message
    const total = overdueOrders.reduce((acc, o) => acc + parseFloat(o.totalAmount), 0);
    const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    const orderList = overdueOrders
      .slice(0, 10)
      .map(o => `• Pedido #${o.id} — ${o.customerName ?? "Cliente"} — ${fmt(parseFloat(o.totalAmount))}`)
      .join("\n");

    const content = `Existem ${overdueOrders.length} pedido(s) entregues há mais de 3 dias sem confirmação de pagamento.\n\nTotal pendente: ${fmt(total)}\n\n${orderList}${overdueOrders.length > 10 ? `\n... e mais ${overdueOrders.length - 10} pedido(s)` : ""}`;

    await notifyOwner({
      title: `⚠️ ${overdueOrders.length} pagamento(s) em atraso`,
      content,
    });

    return res.json({ ok: true, overdueCount: overdueOrders.length, totalPending: total });
  } catch (error: any) {
    console.error("[overduePaymentsHandler] Error:", error);
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
