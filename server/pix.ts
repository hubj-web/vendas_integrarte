/**
 * Gera o "Pix Copia e Cola" (BR Code, padrão EMV do Banco Central) direto pra
 * chave Pix da Integrarte — sem passar por nenhum gateway de pagamento. O
 * cliente escaneia/copia e paga direto no banco dele pro CNPJ da instituição.
 *
 * IMPORTANTE: como não existe gateway envolvido, não há confirmação
 * automática — alguém da equipe precisa confirmar manualmente no painel
 * (Loja Pública → Pedidos → "Confirmar Pagamento") depois de ver o PIX cair
 * na conta.
 *
 * Referência do formato: manual "BR Code" do Banco Central (EMV QR Code Pix).
 */
import QRCode from "qrcode";
import { ENV } from "./_core/env";

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Monta um campo EMV no formato ID + tamanho (2 dígitos) + valor */
function emvField(id: string, value: string): string {
  const length = value.length.toString().padStart(2, "0");
  return `${id}${length}${value}`;
}

/** CRC16-CCITT (falso XModem), exigido no final do payload Pix */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface BuildPixPayloadParams {
  amount: number;
  txid: string; // identificador da transação, só alfanumérico, até 25 caracteres
}

/** Monta o payload Pix (string "copia e cola") pronto pra virar QR code. */
export function buildPixPayload({ amount, txid }: BuildPixPayloadParams): string {
  const pixKey = ENV.pixKey;
  const merchantName = removeAccents(ENV.pixMerchantName).toUpperCase().slice(0, 25).trim();
  const merchantCity = removeAccents(ENV.pixMerchantCity).toUpperCase().slice(0, 15).trim();
  const cleanTxid = txid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 25) || "***";

  const merchantAccountInfo =
    emvField("00", "br.gov.bcb.pix") +
    emvField("01", pixKey);

  const additionalDataField = emvField("05", cleanTxid);

  const payloadWithoutCrc =
    emvField("00", "01") + // Payload Format Indicator
    emvField("26", merchantAccountInfo) + // Merchant Account Information (Pix)
    emvField("52", "0000") + // Merchant Category Code
    emvField("53", "986") + // Transaction Currency (BRL)
    emvField("54", amount.toFixed(2)) + // Transaction Amount
    emvField("58", "BR") + // Country Code
    emvField("59", merchantName) + // Merchant Name
    emvField("60", merchantCity) + // Merchant City
    emvField("62", additionalDataField) + // Additional Data Field (txid)
    "6304"; // CRC placeholder (ID + tamanho fixo, valor calculado a seguir)

  return payloadWithoutCrc + crc16(payloadWithoutCrc);
}

/** Gera o QR code (PNG em base64) a partir do payload Pix */
export async function generatePixQrCodeBase64(payload: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 400 });
  return dataUrl.replace(/^data:image\/png;base64,/, "");
}

export function pixConfigured(): boolean {
  return !!ENV.pixKey;
}
