import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Loader2, Ticket, Download, Share2, Printer } from "lucide-react";
import { toast } from "sonner";
import { BRAND } from "./brand";

const fmt = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const dateFmt = (d: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));

const STATUS_LABEL: Record<string, string> = {
  production: "Em preparação",
  in_route: "Saiu para entrega",
  packaged: "Pronto",
  delivered: "Entregue",
  paid: "Concluído",
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      await loadHtml2Canvas();
      const canvas = await window.html2canvas(cardRef.current, { backgroundColor: "#ffffff", scale: 2 });
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
      try {
        await navigator.share({ title: "Comprovante Integrarte", url });
      } catch {
        // usuário cancelou o compartilhamento — sem problema
      }
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link copiado!");
    }
  }

  function handlePrint() {
    window.print();
  }

  if (isLoading || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando recibo…
      </div>
    );
  }

  const isTicket = order.event?.type === "ingresso";

  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
      <div className="max-w-sm w-full space-y-3">
        <div ref={cardRef}>
        <Card>
          <CardHeader className="text-center">
            <img src="/integrarte-logo.png" alt="Integrarte" className="mx-auto h-14 w-auto object-contain mb-2" />
            {isTicket ? (
              <Ticket className="mx-auto h-8 w-8 mb-1" style={{ color: BRAND.green }} />
            ) : (
              <CheckCircle2 className="mx-auto h-8 w-8 mb-1" style={{ color: BRAND.green }} />
            )}
            <CardTitle style={{ color: BRAND.blue }}>
              {isTicket ? "Ingresso confirmado!" : "Pedido confirmado!"}
            </CardTitle>
            {order.event && <p className="text-sm font-medium" style={{ color: BRAND.blue }}>{order.event.name}</p>}
            {order.event?.eventDate && <p className="text-xs text-muted-foreground">{dateFmt(order.event.eventDate)}</p>}
            <p className="text-xs text-muted-foreground">Pedido #{order.id}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {order.receiptQrBase64 && (
              <div className="flex flex-col items-center gap-2 py-2">
                <img
                  src={`data:image/png;base64,${order.receiptQrBase64}`}
                  alt="QR code do comprovante"
                  className="w-40 h-40 border rounded-lg"
                />
                <p className="text-xs text-muted-foreground text-center">
                  {isTicket ? "Apresente este QR code na entrada do evento." : "QR code do seu comprovante."}
                </p>
              </div>
            )}

            {(order as any).payment?.method === "pix" && (order as any).payment?.qrCode && (
              <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: BRAND.blue }}>
                <p className="text-sm font-medium text-center" style={{ color: BRAND.blue }}>Pagamento via PIX</p>
                {(order as any).payment.qrCodeBase64 && (
                  <img
                    src={`data:image/png;base64,${(order as any).payment.qrCodeBase64}`}
                    alt="QR code do PIX"
                    className="w-40 h-40 mx-auto border rounded-lg"
                  />
                )}
                <button
                  onClick={() => navigator.clipboard.writeText((order as any).payment.qrCode)}
                  className="w-full text-xs py-2 rounded-lg font-medium"
                  style={{ background: BRAND.yellowLight, color: BRAND.blue }}
                >
                  Copiar código PIX (Copia e Cola)
                </button>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant="secondary">{STATUS_LABEL[order.status] ?? order.status}</Badge>
            </div>
            <Separator />
            <div className="space-y-2">
              {order.items.map((item: any, i: number) => (
                <div key={i} className="text-sm">
                  <div className="flex justify-between">
                    <span>{item.quantity}x {item.productName}</span>
                    <span>{fmt(item.subtotal)}</span>
                  </div>
                  {item.selections?.length > 0 && (
                    <p className="text-xs text-muted-foreground pl-3">
                      {item.selections.map((s: any) => s.optionName).join(", ")}
                    </p>
                  )}
                </div>
              ))}
              {Number(order.deliveryCost) > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Entrega ({order.deliveryMethodName})</span>
                  <span>{fmt(order.deliveryCost ?? 0)}</span>
                </div>
              )}
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{fmt(order.totalAmount)}</span>
            </div>
            <p className="text-xs text-center text-muted-foreground pt-2">
              Guarde este link/tela — é o seu comprovante{isTicket ? " de ingresso" : ""}.
              {!isTicket && " Mostre-o na hora de retirar ou receber o pedido."}
            </p>
          </CardContent>
        </Card>
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
    </div>
  );
}
