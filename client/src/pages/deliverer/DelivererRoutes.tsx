import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Truck, MapPin, Navigation, CheckCircle, Play, Package,
  Phone, ArrowLeft, Camera, Route, PackageX, XCircle,
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

const UNDELIVERED_REASONS: { value: string; label: string }[] = [
  { value: "endereco_nao_identificado", label: "Endereço não identificado" },
  { value: "falta_info_complemento", label: "Faltou informação de apartamento/complemento" },
  { value: "cliente_ausente", label: "Cliente não estava na residência" },
  { value: "recusou_recebimento", label: "Cliente recusou receber" },
  { value: "outro", label: "Outro motivo" },
];

export default function DelivererRoutes() {
  const { user } = useLocalAuth();
  const utils = trpc.useUtils();
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [deliveryTypeFilter, setDeliveryTypeFilter] = useState<string>("all");
  const [deliveryDialog, setDeliveryDialog] = useState<{ orderId: number; routeId: number } | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [undeliveredDialog, setUndeliveredDialog] = useState<{ orderId: number; routeId: number; customerName: string } | null>(null);
  const [undeliveredReason, setUndeliveredReason] = useState("");
  const [undeliveredNotes, setUndeliveredNotes] = useState("");

  const { data: routes, isLoading, refetch: refetchRoutes } = trpc.deliveryPublic.myRoutes.useQuery();

  const { data: routeDetail, isLoading: loadingDetail, refetch: refetchDetail } =
    trpc.deliveryPublic.routeDetail.useQuery(
      { routeId: selectedRouteId! },
      { enabled: !!selectedRouteId }
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

  const markUndeliveredMutation = trpc.deliveryPublic.markUndelivered.useMutation({
    onSuccess: () => {
      toast.success("Registrado — pedido volta para produção.");
      setUndeliveredDialog(null);
      setUndeliveredReason("");
      setUndeliveredNotes("");
      refetchDetail();
      refetchRoutes();
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

  // ─── Lista de rotas ───────────────────────────────────────────────────────
  if (!selectedRouteId) {
    const activeRoutes = routes?.filter(r => r.status !== "completed") ?? [];
    const completedRoutes = routes?.filter(r => r.status === "completed") ?? [];

    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Minhas Rotas</h2>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : routes?.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma rota atribuída.</p>
            <p className="text-sm mt-1 opacity-70">
              Aguarde o gestor criar e atribuir uma rota para você.
            </p>
          </div>
        ) : (
          <>
            {/* Rotas ativas */}
            {activeRoutes.length > 0 && (
              <div className="space-y-3">
                {activeRoutes.map(route => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    onClick={() => setSelectedRouteId(route.id)}
                  />
                ))}
              </div>
            )}

            {/* Rotas concluídas */}
            {completedRoutes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4">
                  Concluídas recentemente
                </p>
                {completedRoutes.map(route => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    onClick={() => setSelectedRouteId(route.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ─── Detalhe da rota ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <button
        onClick={() => { setSelectedRouteId(null); setDeliveryTypeFilter("all"); }}
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
          {/* Cabeçalho da rota — visual parecido com o cabeçalho do PDF impresso */}
          <div className="bg-primary rounded-xl p-4 text-primary-foreground">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{routeDetail.name}</h2>
                <p className="text-xs opacity-90 mt-0.5">
                  {routeDetail.deliveryDate
                    ? format(new Date(routeDetail.deliveryDate), "dd/MM/yyyy", { locale: ptBR })
                    : "—"}
                  {"  •  "}
                  {routeDetail.items.length} parada{routeDetail.items.length !== 1 ? "s" : ""}
                  {routeDetail.totalDistance && parseFloat(routeDetail.totalDistance) > 0 && (
                    <> {"  •  "}~{parseFloat(routeDetail.totalDistance).toFixed(1)} km</>
                  )}
                </p>
              </div>
              <Badge className="text-xs bg-white/15 border-white/20 text-white" variant="outline">
                {statusLabel[routeDetail.status] ?? routeDetail.status}
              </Badge>
            </div>
          </div>

          {/* Progresso */}
          {routeDetail.items.length > 0 && (
            <div className="bg-muted/20 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Progresso das entregas</span>
                <span className="text-xs font-semibold">
                  {routeDetail.items.filter(i => i.orderStatus === "delivered" || i.orderStatus === "paid").length}
                  {" / "}
                  {routeDetail.items.length}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-emerald-500 rounded-full h-2 transition-all"
                  style={{
                    width: `${(routeDetail.items.filter(i => i.orderStatus === "delivered" || i.orderStatus === "paid").length / routeDetail.items.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Botões de ação */}
          <div className="flex gap-2">
            {routeDetail.status === "planned" && (
              <Button
                className="flex-1 gap-2"
                onClick={() => startRouteMutation.mutate({ routeId: routeDetail.id })}
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
                onClick={() => completeRouteMutation.mutate({ routeId: routeDetail.id })}
                disabled={completeRouteMutation.isPending}
              >
                <CheckCircle className="w-4 h-4" />
                Concluir Rota
              </Button>
            )}
          </div>

          {/* Links do Maps — pode haver mais de um se a rota tiver mais de 10 paradas */}
          {(routeDetail as any).mapLinks && (routeDetail as any).mapLinks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(routeDetail as any).mapLinks.map((link: string, idx: number) => (
                <Button
                  key={idx}
                  variant="outline"
                  className="flex-1 gap-2 min-w-[140px]"
                  onClick={() => window.open(link, "_blank")}
                >
                  <Navigation className="w-4 h-4" />
                  {(routeDetail as any).mapLinks.length > 1 ? `Maps Parte ${idx + 1}` : "Abrir no Maps"}
                </Button>
              ))}
            </div>
          )}

          {/* Filtro por tipo de entrega */}
          {(() => {
            const deliveryTypes = Array.from(
              new Map(
                routeDetail.items
                  .filter(i => (i as any).deliveryMethodId)
                  .map(i => [(i as any).deliveryMethodId, (i as any).deliveryMethodName])
              ).entries()
            );
            if (deliveryTypes.length <= 1) return null;
            return (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Filtrar por tipo de entrega
                </label>
                <select
                  value={deliveryTypeFilter}
                  onChange={(e) => setDeliveryTypeFilter(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="all">Todos os tipos</option>
                  {deliveryTypes.map(([id, name]) => (
                    <option key={id} value={String(id)}>{name}</option>
                  ))}
                </select>
              </div>
            );
          })()}

          {/* Paradas — layout inspirado no PDF impresso (número, cliente, contato,
              endereço, itens) com os botões de ação do entregador */}
          <div className="space-y-3">
            {(() => {
              const filteredItems = deliveryTypeFilter === "all"
                ? routeDetail.items
                : routeDetail.items.filter(i => String((i as any).deliveryMethodId) === deliveryTypeFilter);

              return (
                <>
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Paradas ({filteredItems.length}{filteredItems.length !== routeDetail.items.length ? ` de ${routeDetail.items.length}` : ""})
                  </h3>
                  {filteredItems.map((item, idx) => {
              const delivered = item.orderStatus === "delivered" || item.orderStatus === "paid";
              const address = (item as any).fullAddress || item.deliveryAddress || "Sem endereço";
              const isPaid = item.orderStatus === "paid";

              return (
                <Card
                  key={item.id}
                  className={`border transition-colors ${
                    delivered
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-border bg-card"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          delivered
                            ? "bg-emerald-500 text-white"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {delivered ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">
                          {item.customerName ?? "—"}
                          <span className="text-xs font-normal text-muted-foreground ml-1.5">
                            (Pedido #{item.orderId})
                          </span>
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                          {item.customerPhone && (
                            <a
                              href={`tel:${item.customerPhone}`}
                              className="flex items-center gap-1 hover:text-primary"
                            >
                              <Phone className="w-3 h-3" />
                              {item.customerPhone}
                            </a>
                          )}
                          {(item as any).deliveryMethodName && <span>{(item as any).deliveryMethodName}</span>}
                          <span>
                            {item.paymentMethod === "pix" ? "PIX" : "Dinheiro"}
                            {" — "}
                            {isPaid ? "Pago" : "A receber"}: {fmt(item.totalAmount ?? 0)}
                          </span>
                        </div>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {address}
                        </p>
                        {(item as any).products && (item as any).products.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5 bg-muted/30 rounded-md p-2">
                            {(item as any).products.map((p: { label: string; quantity: number }, pIdx: number) => (
                              <li key={pIdx} className="flex items-center justify-between text-xs text-foreground">
                                <span className="flex items-center gap-1">
                                  <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                                  {p.label}
                                </span>
                                <span className="font-medium text-muted-foreground">{p.quantity}x</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {item.notes && (
                          <p className="text-xs text-muted-foreground mt-1.5 italic">Obs: {item.notes}</p>
                        )}
                        {(item as any).distanceFromPrevious &&
                          parseFloat((item as any).distanceFromPrevious) > 0 && (
                            <p className="text-xs text-muted-foreground mt-0.5 opacity-70">
                              ~{parseFloat((item as any).distanceFromPrevious).toFixed(1)} km do ponto anterior
                            </p>
                          )}
                        {!delivered && routeDetail.status === "in_progress" && (
                          <div className="flex items-center gap-2 mt-2.5">
                            <Button
                              size="sm"
                              className="h-8 text-xs gap-1 flex-1 bg-emerald-600 hover:bg-emerald-700"
                              onClick={() =>
                                setDeliveryDialog({ orderId: item.orderId, routeId: routeDetail.id })
                              }
                            >
                              <Package className="w-3.5 h-3.5" />
                              Registrar Entrega
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1 flex-1 border-orange-400/40 text-orange-600 hover:bg-orange-50"
                              onClick={() =>
                                setUndeliveredDialog({ orderId: item.orderId, routeId: routeDetail.id, customerName: item.customerName ?? `Pedido #${item.orderId}` })
                              }
                            >
                              <PackageX className="w-3.5 h-3.5" />
                              Não Realizada
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
                  })}
                </>
              );
            })()}
          </div>
        </>
      ) : null}

      {/* Diálogo de registro de entrega */}
      <Dialog
        open={!!deliveryDialog}
        onOpenChange={(v) => {
          if (!v) {
            setDeliveryDialog(null);
            setDeliveryNotes("");
            setProofImage(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Entrega</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Observações (opcional)</Label>
              <Textarea
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="Alguma observação sobre a entrega..."
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Foto do Comprovante (opcional)</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                {proofImage ? (
                  <div className="space-y-2">
                    <img
                      src={proofImage}
                      alt="Comprovante"
                      className="max-h-40 mx-auto rounded-lg object-cover"
                    />
                    <Button variant="outline" size="sm" onClick={() => setProofImage(null)}>
                      Remover
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                    <Camera className="w-8 h-8" />
                    <span className="text-sm">Tirar foto ou selecionar</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeliveryDialog(null);
                setDeliveryNotes("");
                setProofImage(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!deliveryDialog) return;
                registerDeliveryMutation.mutate({
                  routeId: deliveryDialog.routeId,
                  orderId: deliveryDialog.orderId,
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

      {/* Diálogo de entrega não realizada */}
      <Dialog
        open={!!undeliveredDialog}
        onOpenChange={(v) => {
          if (!v) {
            setUndeliveredDialog(null);
            setUndeliveredReason("");
            setUndeliveredNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-orange-500" />
              Entrega Não Realizada
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O pedido de <strong>{undeliveredDialog?.customerName}</strong> volta para produção e pode
            ser incluído em outra rota depois.
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Select value={undeliveredReason} onValueChange={setUndeliveredReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {UNDELIVERED_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observações (opcional)</Label>
              <Textarea
                value={undeliveredNotes}
                onChange={(e) => setUndeliveredNotes(e.target.value)}
                placeholder="Detalhes adicionais..."
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUndeliveredDialog(null);
                setUndeliveredReason("");
                setUndeliveredNotes("");
              }}
            >
              Cancelar
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              disabled={!undeliveredReason || markUndeliveredMutation.isPending}
              onClick={() => {
                if (!undeliveredDialog || !undeliveredReason) return;
                markUndeliveredMutation.mutate({
                  routeId: undeliveredDialog.routeId,
                  orderId: undeliveredDialog.orderId,
                  reason: undeliveredReason as any,
                  notes: undeliveredNotes || undefined,
                });
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Componente de card de rota para a lista
function RouteCard({
  route,
  onClick,
}: {
  route: {
    id: number;
    name: string;
    deliveryDate: Date | null;
    status: string;
    totalDistance?: string | null;
  };
  onClick: () => void;
}) {
  return (
    <Card
      className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer"
      onClick={onClick}
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
            {route.totalDistance && parseFloat(route.totalDistance) > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Route className="w-3 h-3" />
                ~{parseFloat(route.totalDistance).toFixed(1)} km
              </p>
            )}
          </div>
          <Badge
            className={`text-xs border ${statusColor[route.status] ?? ""}`}
            variant="outline"
          >
            {statusLabel[route.status] ?? route.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
