import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useSeller } from "@/contexts/SellerContext";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, User, Package, XCircle, Share2, CheckCircle2, Clock } from "lucide-react";
import { Link } from "wouter";
import { OrderReceiptButton } from "@/components/OrderReceipt";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export default function SellerOrderDetail() {
  const [, params] = useRoute("/vendedor/pedido/:id");
  const [, navigate] = useLocation();
  const { seller } = useSeller();
  const orderId = Number(params?.id);
  const [cancelReason, setCancelReason] = useState("");

  const { data: order, isLoading, refetch } = trpc.seller.orderDetail.useQuery(
    { orderId, sellerId: seller?.id ?? 0 },
    { enabled: !!seller && !!orderId }
  );

  const cancelMutation = trpc.seller.cancelOrder.useMutation({
    onSuccess: () => {
      toast.success("Pedido cancelado com sucesso.");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePaymentMutation = trpc.seller.updatePaymentStatus.useMutation({
    onSuccess: () => {
      toast.success("Status de pagamento atualizado.");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>Pedido não encontrado.</p>
        <Link href="/vendedor/meus-pedidos">
          <Button variant="outline" className="mt-4">Voltar</Button>
        </Link>
      </div>
    );
  }

  const canCancel = order.status === "production";

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link href="/vendedor/meus-pedidos">
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Meus Pedidos
        </button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Pedido #{order.id}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {order.createdAt
              ? format(new Date(order.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
              : "—"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={order.status} />
          <OrderReceiptButton order={order as any} />
        </div>
      </div>

      {/* Customer */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <User className="w-4 h-4" /> Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="font-semibold text-foreground">{order.customer?.name ?? "—"}</p>
          {order.customer?.phone && <p className="text-sm text-muted-foreground">{order.customer.phone}</p>}
          {order.deliveryAddress && <p className="text-sm text-muted-foreground mt-1">{order.deliveryAddress}</p>}
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Package className="w-4 h-4" /> Itens do Pedido
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {order.items.map((item: any) => (
            <div key={item.id} className="flex justify-between text-sm">
              <div>
                <span className="text-foreground">{item.productName ?? `Produto #${item.productId}`} × {item.quantity}</span>
                {item.flavors && item.flavors.length > 0 && (
                  <p className="text-xs text-muted-foreground">{item.flavors.join(", ")}</p>
                )}
              </div>
              <span className="text-muted-foreground">{fmt(item.subtotal)}</span>
            </div>
          ))}
          {order.minipizzas.map((mp: any) => (
            <div key={mp.id} className="flex justify-between text-sm">
              <div>
                <span className="text-foreground">Minipizza {mp.typeName} × {mp.quantity}</span>
                {mp.flavors && mp.flavors.length > 0 && (
                  <p className="text-xs text-muted-foreground">{mp.flavors.join(", ")}</p>
                )}
              </div>
              <span className="text-muted-foreground">{fmt(mp.subtotal)}</span>
            </div>
          ))}
          {order.jellies.map((j) => (
            <div key={j.id} className="flex justify-between text-sm">
              <span className="text-foreground">Geleia {j.flavorName} × {j.quantity}</span>
              <span className="text-muted-foreground">{fmt(j.subtotal)}</span>
            </div>
          ))}
          <div className="border-t border-border pt-2 flex justify-between font-semibold">
            <span className="text-foreground">Total</span>
            <span className="text-foreground">{fmt(order.totalAmount)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Payment info */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-3 text-sm">
          <div className="flex-1 bg-card border border-border rounded-xl p-3">
            <p className="text-muted-foreground text-xs mb-1">Pagamento</p>
            <p className="font-medium text-foreground capitalize">{order.paymentMethod === "pix" ? "PIX" : "Dinheiro"}</p>
          </div>
          <div className="flex-1 bg-card border border-border rounded-xl p-3">
            <p className="text-muted-foreground text-xs mb-1">Status pagamento</p>
            <StatusBadge status={order.paymentStatus} />
          </div>
        </div>

        {/* Payment Actions */}
        {order.status !== "cancelled" && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={order.paymentStatus === "pending" ? "default" : "outline"}
              className="w-full gap-2"
              onClick={() => {
                if (!seller) return;
                updatePaymentMutation.mutate({ orderId: order.id, sellerId: seller.id, paymentStatus: "pending" });
              }}
              disabled={order.paymentStatus === "pending" || updatePaymentMutation.isPending}
            >
              <Clock className="w-4 h-4" />
              Pendente
            </Button>
            <Button
              variant={order.paymentStatus === "paid" ? "default" : "outline"}
              className="w-full gap-2"
              onClick={() => {
                if (!seller) return;
                updatePaymentMutation.mutate({ orderId: order.id, sellerId: seller.id, paymentStatus: "paid" });
              }}
              disabled={order.paymentStatus === "paid" || updatePaymentMutation.isPending}
            >
              <CheckCircle2 className="w-4 h-4" />
              Pago
            </Button>
          </div>
        )}
      </div>

      {/* Cancel */}
      {canCancel && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full border-destructive/30 text-destructive hover:bg-destructive/5 gap-2">
              <XCircle className="w-4 h-4" />
              Cancelar Pedido
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar Pedido #{order.id}</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Informe o motivo do cancelamento.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea
              placeholder="Motivo do cancelamento (obrigatório)..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="min-h-[80px]"
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!seller) return;
                  if (!cancelReason.trim()) {
                    toast.error("Informe o motivo do cancelamento.");
                    return;
                  }
                  cancelMutation.mutate({ orderId: order.id, sellerId: seller.id, cancelReason });
                }}
                className="bg-destructive hover:bg-destructive/90"
              >
                Confirmar Cancelamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {order.status === "cancelled" && order.cancelReason && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
          <p className="text-xs text-destructive font-medium mb-1">Motivo do cancelamento</p>
          <p className="text-sm text-foreground">{order.cancelReason}</p>
        </div>
      )}
    </div>
  );
}
