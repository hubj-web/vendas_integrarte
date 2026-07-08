import axios from "axios";

const ENV = {
  token: (process.env.TELEGRAM_BOT_TOKEN ?? "").trim(),
  chatId: (process.env.TELEGRAM_CHAT_ID ?? "").trim(),
};

/**
 * Sends a notification message to Telegram
 */
export async function sendOrderNotification(order: any) {
  console.log("[Telegram] Attempting to send notification for order:", order.id);
  console.log("[Telegram] Using Token:", ENV.token ? "Configured (starts with " + ENV.token.substring(0, 4) + ")" : "MISSING");
  console.log("[Telegram] Using Chat ID:", ENV.chatId || "MISSING");

  if (!ENV.token || !ENV.chatId) {
    console.error("[Telegram] Bot token or Chat ID not configured, skipping notification.");
    return;
  }

  const fmtCurrency = (v: string | null) => (v ? `R$ ${parseFloat(v).toFixed(2).replace(".", ",")}` : "R$ 0,00");
  
  const message = `
🚀 *NOVO PEDIDO CONFIRMADO!* 🚀
━━━━━━━━━━━━━━━━━━━━━
🆔 *Nº Pedido:* #${order.id}
👤 *Cliente:* ${order.customerName}
📞 *Telefone:* ${order.customerPhone}
📍 *Endereço:* ${order.deliveryAddress || "—"}
🏘️ *Bairro:* ${order.customerNeighborhood || "—"}
🏙️ *Cidade:* ${order.customerCity || "—"}
━━━━━━━━━━━━━━━━━━━━━
🚚 *Entrega:* ${order.deliveryMethodName || "—"}
📅 *Data:* ${order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("pt-BR") : "—"}
💰 *Pagamento:* ${order.paymentMethod === "pix" ? "PIX" : "Dinheiro"}
💵 *Total:* *${fmtCurrency(order.totalAmount)}*
━━━━━━━━━━━━━━━━━━━━━
📦 *Produtos:*
${order.products || "—"}
━━━━━━━━━━━━━━━━━━━━━
👤 *Vendedor(a):* ${order.launcherName || "—"}
📝 *Obs:* ${order.notes || "Nenhuma"}
  `.trim();

  try {
    await axios.post(`https://api.telegram.org/bot${ENV.token}/sendMessage`, {
      chat_id: ENV.chatId,
      text: message,
      parse_mode: "Markdown",
    });
    console.log(`[Telegram] Notification sent for order #${order.id}`);
  } catch (error: any) {
    console.error("[Telegram] Error sending notification:", error.message);
    if (error.response && error.response.data) {
      console.error("[Telegram] API Response Error:", JSON.stringify(error.response.data));
    }
  }
}

/**
 * Test function to verify connection on startup
 */
export async function testTelegramConnection() {
  if (!ENV.token || !ENV.chatId) return;
  
  try {
    await axios.post(`https://api.telegram.org/bot${ENV.token}/sendMessage`, {
      chat_id: ENV.chatId,
      text: "✅ *Sistema de Notificações Integrarte Ativado!*",
      parse_mode: "Markdown",
    });
    console.log("[Telegram] Startup test message sent successfully");
  } catch (error: any) {
    console.error("[Telegram] Startup test failed:", error.message);
  }
}
