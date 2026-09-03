import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Share2, Printer } from "lucide-react";
import { toast } from "sonner";
import WhatsAppFloatButton from "./WhatsAppFloatButton";

const fmt = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const fmtDateTime = (d: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));

const STATUS_LABEL: Record<string, string> = {
  production: "Em preparação",
  in_route: "Saiu para entrega",
  packaged: "Pronto",
  delivered: "Entregue",
  paid: "Concluído",
  cancelled: "Cancelado",
};
const PAYMENT_LABEL: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
};
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Conferência de pagamento pendente",
  paid: "Pago",
  cancelled: "Cancelado",
};

declare global {
  interface Window { html2canvas?: any; }
}

function loadHtml2Canvas(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) return resolve();
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao preparar o download."));
    document.head.appendChild(script);
  });
}

export default function StoreReceipt({ ticketCode }: { ticketCode: string }) {
  const { data: order, isLoading } = trpc.publicStore.orderByTicketCode.useQuery({ ticketCode }, { refetchInterval: 15000 });
  const receiptRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!receiptRef.current) return;
    setDownloading(true);
    try {
      await loadHtml2Canvas();
      const canvas = await window.html2canvas(receiptRef.current, { backgroundColor: "#ffffff", scale: 2 });
      const link = document.createElement("a");
      link.download = `comprovante-integrarte-${ticketCode}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      toast.error("Não foi possível baixar o comprovante. Tenta imprimir como alternativa.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: "Comprovante Integrarte", url }); } catch { /* cancelado */ }
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link copiado!");
    }
  }

  function handlePrint() { window.print(); }

  if (isLoading || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando recibo…
      </div>
    );
  }

  const isTicket = order.event?.type === "ingresso";
  const payment = (order as any).payment as { method: string; qrCode?: string; qrCodeBase64?: string } | null;
  const isPixPending = order.paymentMethod === "pix" && order.paymentStatus === "pending";

  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
      <div className="max-w-[420px] w-full space-y-3">
        <div ref={receiptRef} style={{ width: "100%", background: "#ffffff", fontFamily: "'Segoe UI', Arial, sans-serif", color: "#1a1a1a", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
          {/* Header */}
          <div style={{ background: "#1a4731", padding: "20px 24px 16px", textAlign: "center" }}>
            <img src="/integrarte-logo.png" alt="Integrarte" style={{ height: 40, margin: "0 auto 8px", display: "block", background: "#fff", borderRadius: 10, padding: 4 }} />
            <div style={{ color: "#ffffff", fontSize: 22, fontWeight: 700, letterSpacing: 0.5 }}>Integrarte</div>
            <div style={{ color: "#86efac", fontSize: 12, marginTop: 2 }}>{isTicket ? "Recibo de Ingresso" : "Recibo de Pedido"}</div>
          </div>

          {/* Número + data */}
          <div style={{ background: "#f0fdf4", borderBottom: "1px solid #bbf7d0", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Pedido</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1a4731" }}>#{order.id}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Data</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{fmtDateTime(order.createdAt)}</div>
            </div>
          </div>

          <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            {order.event && (
              <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Evento</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{order.event.name}</div>
                {order.event.eventDate && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{fmtDateTime(order.event.eventDate)}</div>}
              </div>
            )}

            {order.customerName && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Cliente</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{order.customerName}</div>
                {(order as any).customerPhone && <div style={{ fontSize: 13, color: "#4b5563", marginTop: 2 }}>{(order as any).customerPhone}</div>}
              </div>
            )}

            {order.deliveryMethodName && (
              <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Entrega</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{order.deliveryMethodName}</div>
              </div>
            )}

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Itens do Pedido</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {order.items.map((item: any, idx: number) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: idx < order.items.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    <div style={{ flex: 1, paddingRight: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{item.quantity}x {item.productName}</div>
                      {item.selections?.length > 0 && (
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{item.selections.map((s: any) => s.optionName).join(", ")}</div>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a4731", whiteSpace: "nowrap" }}>{fmt(item.subtotal)}</div>
                  </div>
                ))}
                {Number(order.deliveryCost) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid #f3f4f6" }}>
                    <div style={{ fontSize: 13, color: "#374151" }}>Entrega</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{fmt(order.deliveryCost ?? 0)}</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: "#1a4731", borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "#86efac", fontSize: 13, fontWeight: 600 }}>TOTAL</div>
              <div style={{ color: "#ffffff", fontSize: 22, fontWeight: 800 }}>{fmt(order.totalAmount)}</div>
            </div>

            <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Pagamento</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}</div>
                <div style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: order.paymentStatus === "paid" ? "#dcfce7" : "#fef9c3", color: order.paymentStatus === "paid" ? "#166534" : "#854d0e" }}>
                  {PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus}
                </div>
              </div>

              {isPixPending && payment?.qrCode && (
                <div style={{ marginTop: 10, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#1e40af", fontWeight: 700, marginBottom: 8 }}>Pague com PIX</div>
                  {payment.qrCodeBase64 && (
                    <img src={`data:image/png;base64,${payment.qrCodeBase64}`} alt="QR code do PIX" style={{ width: 140, height: 140, margin: "0 auto 8px", borderRadius: 8 }} />
                  )}
                  <button
                    onClick={() => { navigator.clipboard.writeText(payment.qrCode!); toast.success("Código copiado!"); }}
                    style={{ width: "100%", fontSize: 11, padding: "8px", borderRadius: 8, fontWeight: 600, background: "#dbeafe", color: "#1e40af", border: "none", cursor: "pointer" }}
                  >
                    Copiar código PIX (Copia e Cola)
                  </button>
                </div>
              )}
            </div>

            {order.receiptQrBase64 && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                  {isTicket ? "QR do Ingresso" : "QR do Comprovante"}
                </div>
                <img src={`data:image/png;base64,${order.receiptQrBase64}`} alt="QR code do comprovante" style={{ width: 140, height: 140, margin: "0 auto", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
                  {isTicket ? "Apresente este QR code na entrada do evento." : "Mostre na hora de retirar/receber."}
                </div>
              </div>
            )}

            {(order as any).notes && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Observações</div>
                <div style={{ fontSize: 12, color: "#78350f" }}>{(order as any).notes}</div>
              </div>
            )}

            <div style={{ textAlign: "center", paddingTop: 4, paddingBottom: 4 }}>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>Integrarte · CNPJ 21.242.789/0001-67</div>
              <div style={{ fontSize: 10, color: "#d1d5db", marginTop: 2 }}>Obrigado pela preferência!</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 print:hidden">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownload} disabled={downloading}>
            <Download className="h-3.5 w-3.5" /> Baixar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleShare}>
            <Share2 className="h-3.5 w-3.5" /> Compartilhar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </Button>
        </div>
      </div>
      <WhatsAppFloatButton />
    </div>
  );
}
