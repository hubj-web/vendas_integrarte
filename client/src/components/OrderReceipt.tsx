import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Share2, Download, X, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PIX_KEY = "21.242.789/0001-67";
const PIX_KEY_RAW = "21242789000167";
const COMPANY_NAME = "Integrarte";

const STATUS_LABELS: Record<string, string> = {
  production: "Em produção",
  in_route: "Em rota",
  delivered: "Entregue",
  paid: "Pago",
  cancelled: "Cancelado",
};
const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
};
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pagamento pendente",
  paid: "Pago",
  partial: "Pago parcialmente",
  cancelled: "Cancelado",
};

type OrderItem = { id: number; productName: string | null; quantity: number; unitPrice: string; subtotal: string; unit: string | null };
type OrderMinipizza = { id: number; typeName: string | null; typeUnits: number | null; quantity: number; unitPrice: string; subtotal: string; flavors: (string | null)[] };
type OrderJelly = { id: number; flavorName: string | null; quantity: number; unitPrice: string; subtotal: string };

type OrderData = {
  id: number;
  createdAt: Date | string;
  customerName: string | null;
  customerPhone: string | null;
  customerStreet?: string | null;
  customerNumber?: string | null;
  customerNeighborhood?: string | null;
  customerCity?: string | null;
  customerLocationRef?: string | null;
  deliveryMethodName: string | null;
  deliveryDate?: Date | string | null;
  deliveryAddress?: string | null;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  totalAmount: string;
  notes?: string | null;
  launcherName?: string | null;
  items: OrderItem[];
  minipizzas: OrderMinipizza[];
  jellies: OrderJelly[];
};

function fmt(v: string | number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(String(v)));
}
function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR");
}
function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR");
}

// ── RECEIPT LAYOUT (rendered off-screen for capture) ──────────────────────────
function ReceiptLayout({ order }: { order: OrderData }) {
  const address = [order.customerStreet, order.customerNumber, order.customerNeighborhood, order.customerCity]
    .filter(Boolean).join(", ");

  const totalItems = [
    ...order.items.map(i => ({ name: i.productName, detail: `${i.unit}`, qty: i.quantity, price: i.unitPrice, sub: i.subtotal })),
    ...order.minipizzas.map(m => ({
      name: `${m.typeName} (${m.typeUnits} un.)`,
      detail: m.flavors.length > 0 ? m.flavors.join(", ") : "",
      qty: m.quantity,
      price: m.unitPrice,
      sub: m.subtotal,
    })),
    ...order.jellies.map(j => ({
      name: `Geleia ${j.flavorName}`,
      detail: "",
      qty: j.quantity,
      price: j.unitPrice,
      sub: j.subtotal,
    })),
  ];

  const isPix = order.paymentMethod === "pix";
  const isPending = order.paymentStatus === "pending" || order.paymentStatus === "partial";

  return (
    <div
      style={{
        width: 420,
        background: "#ffffff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        color: "#1a1a1a",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
      }}
    >
      {/* Header */}
      <div style={{ background: "#1a4731", padding: "20px 24px 16px", textAlign: "center" }}>
        <div style={{ color: "#ffffff", fontSize: 22, fontWeight: 700, letterSpacing: 0.5 }}>
          {COMPANY_NAME}
        </div>
        <div style={{ color: "#86efac", fontSize: 12, marginTop: 2 }}>
          Recibo de Pedido
        </div>
      </div>

      {/* Order number + date */}
      <div style={{
        background: "#f0fdf4",
        borderBottom: "1px solid #bbf7d0",
        padding: "12px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
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

        {/* Customer */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
            Cliente
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{order.customerName}</div>
          {order.customerPhone && (
            <div style={{ fontSize: 13, color: "#4b5563", marginTop: 2 }}>{order.customerPhone}</div>
          )}
          {address && (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>{address}</div>
          )}
          {order.customerLocationRef && (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Ref: {order.customerLocationRef}</div>
          )}
        </div>

        {/* Delivery */}
        <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
            Entrega
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{order.deliveryMethodName}</div>
          {order.deliveryDate && (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              Data prevista: {fmtDate(order.deliveryDate)}
            </div>
          )}
          {order.deliveryAddress && (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{order.deliveryAddress}</div>
          )}
        </div>

        {/* Items */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
            Itens do Pedido
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {totalItems.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  padding: "7px 0",
                  borderBottom: idx < totalItems.length - 1 ? "1px solid #f3f4f6" : "none",
                }}
              >
                <div style={{ flex: 1, paddingRight: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{item.name}</div>
                  {item.detail && (
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{item.detail}</div>
                  )}
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    {item.qty}× {fmt(item.price)}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a4731", whiteSpace: "nowrap" }}>
                  {fmt(item.sub)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        <div style={{
          background: "#1a4731",
          borderRadius: 10,
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ color: "#86efac", fontSize: 13, fontWeight: 600 }}>TOTAL</div>
          <div style={{ color: "#ffffff", fontSize: 22, fontWeight: 800 }}>{fmt(order.totalAmount)}</div>
        </div>

        {/* Payment */}
        <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
            Pagamento
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
              {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
            </div>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 20,
              background: order.paymentStatus === "paid" ? "#dcfce7" : "#fef9c3",
              color: order.paymentStatus === "paid" ? "#166534" : "#854d0e",
            }}>
              {PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
            </div>
          </div>

          {/* PIX key — show when payment is PIX and pending */}
          {isPix && isPending && (
            <div style={{
              marginTop: 10,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 8,
              padding: "10px 12px",
            }}>
              <div style={{ fontSize: 11, color: "#1e40af", fontWeight: 700, marginBottom: 4 }}>
                Chave PIX (CNPJ)
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#1d4ed8", letterSpacing: 0.5 }}>
                {PIX_KEY}
              </div>
              <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 3 }}>
                Favorecido: {COMPANY_NAME}
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        {order.notes && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
              Observações
            </div>
            <div style={{ fontSize: 12, color: "#78350f" }}>{order.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", paddingTop: 4, paddingBottom: 4 }}>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>
            {COMPANY_NAME} · CNPJ {PIX_KEY}
          </div>
          <div style={{ fontSize: 10, color: "#d1d5db", marginTop: 2 }}>
            Obrigado pela preferência!
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export function OrderReceiptButton({ order }: { order: OrderData }) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  async function generateImage() {
    if (!receiptRef.current) return null;
    const canvas = await html2canvas(receiptRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    return canvas.toDataURL("image/png");
  }

  async function handleOpen() {
    setOpen(true);
    setImageUrl(null);
    setGenerating(true);
    try {
      // Small delay to ensure DOM is rendered
      await new Promise(r => setTimeout(r, 300));
      const url = await generateImage();
      setImageUrl(url);
    } catch (e) {
      toast.error("Erro ao gerar recibo.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload() {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `recibo-pedido-${order.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Recibo salvo!");
  }

  async function handleShare() {
    if (!imageUrl) return;
    try {
      // Convert base64 to blob
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const file = new File([blob], `recibo-pedido-${order.id}.png`, { type: "image/png" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Recibo Pedido #${order.id} — ${COMPANY_NAME}`,
          text: `Recibo do pedido #${order.id} de ${order.customerName}`,
          files: [file],
        });
      } else {
        // Fallback: download
        handleDownload();
        toast.info("Compartilhamento não disponível neste dispositivo. Imagem salva!");
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast.error("Erro ao compartilhar.");
      }
    }
  }

  async function handleCopyPix() {
    try {
      await navigator.clipboard.writeText(PIX_KEY_RAW);
      setCopied(true);
      toast.success("Chave PIX copiada!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar a chave PIX.");
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 border-green-600/40 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
        onClick={handleOpen}
      >
        <Share2 className="w-4 h-4" />
        Recibo
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[480px] p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-green-600" />
              Recibo do Pedido #{order.id}
            </DialogTitle>
          </DialogHeader>

          {/* Hidden receipt for capture */}
          <div
            style={{
              position: "absolute",
              left: -9999,
              top: 0,
              opacity: 0,
              pointerEvents: "none",
              zIndex: -1,
            }}
          >
            <div ref={receiptRef}>
              <ReceiptLayout order={order} />
            </div>
          </div>

          {/* Preview */}
          <div className="px-5 pb-2">
            {generating ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                <p className="text-sm text-muted-foreground">Gerando recibo...</p>
              </div>
            ) : imageUrl ? (
              <div className="rounded-xl overflow-hidden border border-border shadow-sm">
                <img src={imageUrl} alt="Recibo" className="w-full" />
              </div>
            ) : null}
          </div>

          {/* Actions */}
          {imageUrl && (
            <div className="px-5 pb-5 flex flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2 bg-green-700 hover:bg-green-800 text-white"
                  onClick={handleShare}
                >
                  <Share2 className="w-4 h-4" />
                  Compartilhar
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleDownload}
                >
                  <Download className="w-4 h-4" />
                  Salvar imagem
                </Button>
              </div>

              {order.paymentMethod === "pix" && (
                <Button
                  variant="outline"
                  className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400"
                  onClick={handleCopyPix}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Chave PIX copiada!" : `Copiar chave PIX: ${PIX_KEY}`}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
