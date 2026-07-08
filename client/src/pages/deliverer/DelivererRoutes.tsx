import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useDeliverer } from "@/contexts/DelivererContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Truck, MapPin, Navigation, CheckCircle, Play, Package,
  Phone, ArrowLeft, Camera
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const statusLabel: Record<string, string> = {
  planned: "Planejada",
  in_progress: "Em andamento",
  completed: "Concluída",
};

const statusColor: Record<string, string> = {
  planned: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  in_progress: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};

export default function DelivererRoutes() {
  const { deliverer } = useDeliverer();
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [deliveryDialog, setDeliveryDialog] = useState<{ orderId: number; routeId: number } | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [proofImage, setProofImage] = useState<string | null>(null);

  const { data: routes, isLoading, refetch: refetchRoutes } = trpc.deliveryPublic.myRoutes.useQuery(
    { delivererId: deliverer?.id ?? 0 },
    { enabled: !!deliverer }
  );

  const { data: routeDetail, isLoading: loadingDetail, refetch: refetchDetail } = trpc.deliveryPublic.routeDetail.useQuery(
    { routeId: selectedRouteId!, delivererId: deliverer?.id ?? 0 },
    { enabled: !!selectedRouteId && !!deliverer }
  );

  const startRouteMutation = trpc.deliveryPublic.startRoute.useMutation({
    onSuccess: () => { toast.success("Rota iniciada!"); refetchRoutes(); refetchDetail(); },
    onError: (e) => toast.error(e.message),
  });

  const completeRouteMutation = trpc.deliveryPublic.completeRoute.useMutation({
    onSuccess: () => { toast.success("Rota concluída!"); refetchRoutes(); refetchDetail(); },
    onError: (e) => toast.error(e.message),
  });

  const registerDeliveryMutation = trpc.deliveryPublic.registerDelivery.useMutation({
    onSuccess: () => {
      toast.success("Entrega registrada!");
      setDeliveryDialog(null);
      setDeliveryNotes("");
      setProofImage(null);
      refetchDetail();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProofImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Route list view
  if (!selectedRouteId) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Minhas Rotas</h2>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : routes?.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nenhuma rota atribuída.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {routes?.map(route => (
              <Card
                key={route.id}
                className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => setSelectedRouteId(route.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{route.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {route.deliveryDate
                          ? format(new Date(route.deliveryDate), "dd/MM/yyyy", { locale: ptBR })
                          : "—"}
                      </p>
                    </div>
                    <Badge className={`text-xs border ${statusColor[route.status] ?? ""}`} variant="outline">
                      {statusLabel[route.status] ?? route.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Route detail view
  return (
    <div className="space-y-4">
      <button
        onClick={() => setSelectedRouteId(null)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Minhas Rotas
      </button>

      {loadingDetail ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : routeDetail ? (
        <>
          {/* Route header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{routeDetail.name}</h2>
              <p className="text-sm text-muted-foreground">
                {routeDetail.deliveryDate
                  ? format(new Date(routeDetail.deliveryDate), "dd/MM/yyyy", { locale: ptBR })
                  : "—"}
              </p>
            </div>
            <Badge className={`text-xs border ${statusColor[routeDetail.status] ?? ""}`} variant="outline">
              {statusLabel[routeDetail.status] ?? routeDetail.status}
            </Badge>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {routeDetail.status === "planned" && (
              <Button
                className="flex-1 gap-2"
                onClick={() => {
                  if (!deliverer) return;
                  startRouteMutation.mutate({ routeId: routeDetail.id, delivererId: deliverer.id });
                }}
                disabled={startRouteMutation.isPending}
              >
                <Play className="w-4 h-4" />
                Iniciar Rota
              </Button>
            )}
            {routeDetail.status === "in_progress" && (
              <Button
                variant="outline"
                className="flex-1 gap-2 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/5"
                onClick={() => {
                  if (!deliverer) return;
                  completeRouteMutation.mutate({ routeId: routeDetail.id, delivererId: deliverer.id });
                }}
                disabled={completeRouteMutation.isPending}
              >
                <CheckCircle className="w-4 h-4" />
                Concluir Rota
              </Button>
            )}
            {routeDetail.mapsUrl && (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => window.open(routeDetail.mapsUrl, "_blank")}
              >
                <Navigation className="w-4 h-4" />
                Abrir no Maps
              </Button>
            )}
          </div>

          {/* Stops */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Paradas ({routeDetail.items.length})</h3>
            {routeDetail.items.map((item, idx) => {
              const delivered = item.orderStatus === "delivered" || item.orderStatus === "paid";
              return (
                <Card
                  key={item.id}
                  className={`border transition-colors ${delivered ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card"}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        delivered ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary"
                      }`}>
                        {delivered ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{item.customerName ?? "—"}</p>
                        {item.customerPhone && (
                          <a href={`tel:${item.customerPhone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-0.5">
                            <Phone className="w-3 h-3" />
                            {item.customerPhone}
                          </a>
                        )}
                        {item.deliveryAddress && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {item.deliveryAddress}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-foreground">{fmt(item.totalAmount ?? 0)}</span>
                            <span className="text-xs text-muted-foreground capitalize">
                              {item.paymentMethod === "pix" ? "PIX" : "Dinheiro"}
                            </span>
                          </div>
                          {!delivered && routeDetail.status === "in_progress" && (
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => setDeliveryDialog({ orderId: item.orderId, routeId: routeDetail.id })}
                            >
                              <Package className="w-3.5 h-3.5" />
                              Registrar Entrega
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}

      {/* Delivery registration dialog */}
      <Dialog open={!!deliveryDialog} onOpenChange={(v) => { if (!v) { setDeliveryDialog(null); setDeliveryNotes(""); setProofImage(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Entrega</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Observações (opcional)</Label>
              <Textarea
                value={deliveryNotes}
                onChange={e => setDeliveryNotes(e.target.value)}
                placeholder="Alguma observação sobre a entrega..."
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Foto do Comprovante (opcional)</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                {proofImage ? (
                  <div className="space-y-2">
                    <img src={proofImage} alt="Comprovante" className="max-h-40 mx-auto rounded-lg object-cover" />
                    <Button variant="outline" size="sm" onClick={() => setProofImage(null)}>Remover</Button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                    <Camera className="w-8 h-8" />
                    <span className="text-sm">Tirar foto ou selecionar</span>
                    <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
                  </label>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeliveryDialog(null); setDeliveryNotes(""); setProofImage(null); }}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!deliveryDialog || !deliverer) return;
                registerDeliveryMutation.mutate({
                  routeId: deliveryDialog.routeId,
                  orderId: deliveryDialog.orderId,
                  delivererId: deliverer.id,
                  notes: deliveryNotes || undefined,
                  proofImageBase64: proofImage || undefined,
                });
              }}
              disabled={registerDeliveryMutation.isPending}
            >
              Confirmar Entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
