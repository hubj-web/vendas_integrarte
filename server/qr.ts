import QRCode from "qrcode";

/** Gera um QR code (PNG em base64) a partir de qualquer texto/URL. */
export async function generateQrCodeBase64(data: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(data, { errorCorrectionLevel: "M", margin: 1, width: 400 });
  return dataUrl.replace(/^data:image\/png;base64,/, "");
}
