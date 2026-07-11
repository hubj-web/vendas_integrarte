import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, User, MapPin, CreditCard, Package, Clock, XCircle, Loader2, Pencil } from "lucide-react";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Link } from "wouter";
import { OrderReceiptButton } from "@/components/OrderReceipt";

const statusFlow: Record<string, string[]> = {
  production: ["in_route", "cancelled"],
  in_route: ["packaged", "delivered", "cancelled"],
  packaged: ["delivered", "cancelled"],
  delivered: ["paid", "cancelled"],
  paid: ["cancelled"],
  cancelled: [],
};

const statusLabels: Record<string, string> = {
  production: "Em Produção",
  in_route: "Enviar para Rota",
  packaged: "Marcar como Empacotado",
  delivered: "Marcar como Entregue",
  paid: "Marcar como Pago",
  cancelled: "Cancelar Pedido",
};

export default function OrderDetail() {
  const [, params] = useRoute("/admin/pedidos/:id");
  const [, navigate] = useLocation();
  const { user } = useLocalAuth();
  const orderId = Number(params?.id);
  const utils = trpc.useUtils();

  const { data: order, isLoading } = trpc.orders.getById.useQuery({ id: orderId }, { enabled: !!orderId });

  const updateStatusMutation = trpc.orders.updateStatus.useMutation({
    onSuccess: () => { utils.orders.getById.invalidate({ id: orderId }); toast.success("Status atualizado!"); setCancelOpen(false); setStatusOpen(false); },
    onError: e => toast.error(e.message),
  });

  const [statusOpen, setStatusOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [statusNotes, setStatusNotes] = useState("");

  const fmt = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(v));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  if (!order) return <div className="text-center py-12 text-muted-foreground">Pedido não encontrado.</div>;

  const nextStatuses = statusFlow[order.status] ?? [];
  const canChangeStatus = user?.role !== "delivery" || (order.status === "in_route");

  return (
    <div>
      <PageHeader
        title={`Pedido #${order.id}`}
        description={`Criado em ${new Date(order.createdAt).toLocaleString("pt-BR")}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/admin/pedidos">
              <Button variant="outline" size="sm" className="gap-2"><ArrowLeft className="w-4 h-4" />Voltar</Button>
            </Link>
            <OrderReceiptButton order={order} />
            {/* Admin Edit Button */}
            {user && (user.role === "admin" || (user as any).roles?.includes("admin")) && (
              <Link href={`/admin/pedidos/${order.id}/editar`}>
                <Button variant="outline" size="sm" className="gap-2 border-primary/30 text-primary hover:bg-primary/10">
                  <Pencil className="w-4 h-4" />Editar
                </Button>
              </Link>
            )}
            {canChangeStatus && nextStatuses.filter(s => s !== "cancelled").map(s => (
              <Button key={s} size="sm" className="bg-primary text-primary-foreground gap-2" onClick={() => { setNewStatus(s); setStatusOpen(true); }}>
                {statusLabels[s]}
              </Button>
            ))}
            {canChangeStatus && nextStatuses.includes("cancelled") && order.status !== "cancelled" && (
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 gap-2" onClick={() => setCancelOpen(true)}>
                <XCircle className="w-4 h-4" />Cancelar
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Customer & delivery */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><User className="w-4 h-4 text-primary" />Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold">{order.customerName}</p>
            <p className="text-muted-foreground">{order.customerPhone}</p>
            {(order.customerStreet || order.customerNeighborhood) && (
              <div className="flex items-start gap-1.5 text-muted-foreground">
                <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{[order.customerStreet, order.customerNumber, (order as any).customerComplement, order.customerNeighborhood, order.customerCity].filter(Boolean).join(", ")}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4 text-primary" />Entrega</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{order.deliveryMethodName}</p>
            {order.deliveryDate && <p className="text-muted-foreground">Data: {new Date(order.deliveryDate).toLocaleDateString("pt-BR")}</p>}
            {order.deliveryAddress && <p className="text-muted-foreground">{order.deliveryAddress}</p>}
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge status={order.status} />
              <StatusBadge status={order.paymentStatus} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" />Pagamento</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{order.paymentMethod === "pix" ? "PIX" : "Dinheiro"}</p>
            <p className="text-2xl font-bold text-primary">{fmt(order.totalAmount)}</p>
            {order.launcherName && <p className="text-muted-foreground">Vendedor: {order.launcherName}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card className="bg-card border-border mt-4">
        <CardHeader className="pb-3"><CardTitle className="text-sm">Itens do Pedido</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {order.items.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">{item.unit} · {fmt(item.unitPrice)} / un.</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">× {item.quantity}</p>
                  <p className="text-sm font-semibold text-primary">{fmt(item.subtotal)}</p>
                </div>
              </div>
            ))}
            {order.minipizzas.map(mp => (
              <div key={mp.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{mp.typeName} ({mp.typeUnits} un.)</p>
                  {mp.flavors.length > 0 && <p className="text-xs text-muted-foreground">{mp.flavors.join(", ")}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">× {mp.quantity}</p>
                  <p className="text-sm font-semibold text-primary">{fmt(mp.subtotal)}</p>
                </div>
              </div>
            ))}
            {order.jellies.map(j => (
              <div key={j.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">Geleia {j.flavorName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">× {j.quantity}</p>
                  <p className="text-sm font-semibold text-primary">{fmt(j.subtotal)}</p>
                </div>
              </div>
            ))}
          </div>
          <Separator className="my-3" />
          <div className="flex items-center justify-between">
            <span className="font-bold">Total</span>
            <span className="text-xl font-bold text-primary">{fmt(order.totalAmount)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Notes & cancel reason */}
      {(order.notes || order.cancelReason) && (
        <Card className="bg-card border-border mt-4">
          <CardContent className="pt-4 space-y-2">
            {order.notes && <div><p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Observações</p><p className="text-sm mt-1">{order.notes}</p></div>}
            {order.cancelReason && <div><p className="text-xs text-destructive font-medium uppercase tracking-wider">Motivo do Cancelamento</p><p className="text-sm mt-1">{order.cancelReason}</p></div>}
          </CardContent>
        </Card>
      )}

      {/* History */}
      {order.history.length > 0 && (
        <Card className="bg-card border-border mt-4">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-primary" />Histórico</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {order.history.map(h => (
                <div key={h.id} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-primary/40 mt-1.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="font-medium">{h.fromStatus ? `${h.fromStatus} → ` : ""}{h.toStatus}</span>
                    {h.notes && <span className="text-muted-foreground"> · {h.notes}</span>}
                    <p className="text-xs text-muted-foreground">{h.userName} · {new Date(h.changedAt).toLocaleString("pt-BR")}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status change dialog */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>Confirmar: {statusLabels[newStatus]}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={statusNotes} onChange={e => setStatusNotes(e.target.value)} className="bg-input resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancelar</Button>
            <Button onClick={() => updateStatusMutation.mutate({ id: orderId, status: newStatus as any, notes: statusNotes || undefined })} className="bg-primary text-primary-foreground" disabled={updateStatusMutation.isPending}>
              {updateStatusMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle className="text-destructive">Cancelar Pedido</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Informe o motivo do cancelamento. Esta ação não pode ser desfeita.</p>
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="bg-input resize-none" rows={3} placeholder="Descreva o motivo..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button onClick={() => { if (!cancelReason.trim()) return toast.error("Justificativa obrigatória."); updateStatusMutation.mutate({ id: orderId, status: "cancelled", cancelReason }); }} className="bg-destructive text-white" disabled={updateStatusMutation.isPending}>
              {updateStatusMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Cancelar Pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
