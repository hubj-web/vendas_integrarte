import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Loader2 } from "lucide-react";
import { BRAND } from "./brand";

const fmt = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const STATUS_LABEL: Record<string, string> = {
  production: "Em preparação",
  in_route: "Saiu para entrega",
  packaged: "Pronto",
  delivered: "Entregue",
  paid: "Concluído",
  cancelled: "Cancelado",
};

export default function StoreReceipt({ orderId }: { orderId: number }) {
  const { data: order, isLoading } = trpc.publicStore.orderStatus.useQuery({ orderId }, { refetchInterval: 15000 });

  if (isLoading || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando recibo…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
      <Card className="max-w-sm w-full">
        <CardHeader className="text-center">
          <img src="/integrarte-logo.png" alt="Integrarte" className="mx-auto h-14 w-auto object-contain mb-2" />
          <CheckCircle2 className="mx-auto h-8 w-8 mb-1" style={{ color: BRAND.green }} />
          <CardTitle style={{ color: BRAND.blue }}>Pedido confirmado!</CardTitle>
          <p className="text-sm text-muted-foreground">Pedido #{order.id}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant="secondary">{STATUS_LABEL[order.status] ?? order.status}</Badge>
          </div>
          <Separator />
          <div className="space-y-1">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{item.quantity}x {item.productName}</span>
                <span>{fmt(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total pago</span>
            <span>{fmt(order.totalAmount)}</span>
          </div>
          <p className="text-xs text-center text-muted-foreground pt-2">
            Guarde este link/tela — é o seu comprovante. Mostre-o na hora de retirar ou receber o pedido.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
