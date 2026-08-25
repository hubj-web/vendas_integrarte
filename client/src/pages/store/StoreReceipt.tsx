import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Loader2, Ticket } from "lucide-react";
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

export default function StoreReceipt({ ticketCode }: { ticketCode: string }) {
  const { data: order, isLoading } = trpc.publicStore.orderByTicketCode.useQuery({ ticketCode }, { refetchInterval: 15000 });

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
      <Card className="max-w-sm w-full">
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
  );
}
