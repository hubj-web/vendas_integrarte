/**
 * Integração com o Mercado Pago para a Loja Pública.
 * Usa o Payment Brick (embutido na própria loja, sem redirecionar o cliente):
 * o brick tokeniza o pagamento no navegador (PIX ou cartão) e o backend só
 * confirma a criação do pagamento na API do Mercado Pago e depois recebe a
 * confirmação definitiva via webhook.
 *
 * Documentação: https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/introduction
 */
import { MercadoPagoConfig, Payment } from "mercadopago";
import { ENV } from "./_core/env";

let client: MercadoPagoConfig | null = null;

function getClient(): MercadoPagoConfig {
  if (!ENV.mercadoPagoAccessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
  }
  if (!client) {
    client = new MercadoPagoConfig({ accessToken: ENV.mercadoPagoAccessToken });
  }
  return client;
}

export function mercadoPagoConfigured(): boolean {
  return !!ENV.mercadoPagoAccessToken;
}

export interface CreatePaymentParams {
  orderId: number;
  amount: number;
  method: "pix" | "credit_card";
  customerName: string;
  customerEmail: string;
  // Só para cartão — vem do Payment Brick já tokenizado no frontend
  cardToken?: string;
  installments?: number;
  paymentMethodId?: string; // ex: "master", "visa" — devolvido pelo brick
  issuerId?: string;
}

export interface CreatePaymentResult {
  mpPaymentId: string;
  status: string; // approved | pending | rejected | in_process
  qrCode?: string;
  qrCodeBase64?: string;
}

/** Cria o pagamento no Mercado Pago (PIX gera QR code na hora; cartão processa direto). */
export async function createMercadoPagoPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
  const payment = new Payment(getClient());

  const idempotencyKey = `loja-integrarte-order-${params.orderId}`;

  const body: any = {
    transaction_amount: Number(params.amount.toFixed(2)),
    description: `Pedido #${params.orderId} — Loja Integrarte`,
    payer: { email: params.customerEmail, first_name: params.customerName },
    notification_url: `${ENV.appUrl}/api/webhooks/mercadopago`,
    external_reference: String(params.orderId),
  };

  if (params.method === "pix") {
    body.payment_method_id = "pix";
  } else {
    body.token = params.cardToken;
    body.installments = params.installments ?? 1;
    body.payment_method_id = params.paymentMethodId;
    if (params.issuerId) body.issuer_id = params.issuerId;
  }

  const result = await payment.create({ body, requestOptions: { idempotencyKey } });

  return {
    mpPaymentId: String(result.id),
    status: result.status ?? "pending",
    qrCode: result.point_of_interaction?.transaction_data?.qr_code ?? undefined,
    qrCodeBase64: result.point_of_interaction?.transaction_data?.qr_code_base64 ?? undefined,
  };
}

/** Busca o status atual de um pagamento na API do Mercado Pago (usado pelo webhook). */
export async function getMercadoPagoPayment(mpPaymentId: string) {
  const payment = new Payment(getClient());
  return payment.get({ id: mpPaymentId });
}
