import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  MapPin, Truck, ExternalLink, ChevronDown, ChevronUp,
  Loader2, Calendar, Zap, Trash2, CheckSquare, Square, X, UserPlus, RefreshCw,
} from "lucide-react";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Link } from "wouter";

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function getMonthOptions() {
  const now = new Date();
  const options = [{ value: "all", label: "Todos os meses" }];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ value, label });
  }
  return options;
}

export default function DeliveryRoutes() {
  const { user } = useLocalAuth();
  const utils = trpc.useUtils();
  const [month, setMonth] = useState("all");

  const { data: routes = [], isLoading } = trpc.delivery.routes.list.useQuery();
  const { data: deliverers = [] } = trpc.users.list.useQuery({ search: undefined });

  const updateStatusMutation = trpc.delivery.routes.updateStatus.useMutation({
    onSuccess: () => { utils.delivery.routes.list.invalidate(); toast.success("Status atualizado!"); },
  });

  const assignDelivererMutation = trpc.routeOptimization.assignDeliverer.useMutation({
    onSuccess: () => { utils.delivery.routes.list.invalidate(); toast.success("Entregador atribuído!"); },
    onError: (e) => toast.error(e.message),
  });

  const recalculateMutation = trpc.routeOptimization.recalculateRouteDistances.useMutation({
    onSuccess: (data) => {
      utils.delivery.routes.list.invalidate();
      utils.delivery.routes.getById.invalidate();
      toast.success(data.message);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteRoutesMutation = trpc.delivery.routes.delete.useMutation({
    onSuccess: (data) => {
      utils.delivery.routes.list.invalidate();
      utils.delivery.routes.availableOrders.invalidate({});
      toast.success(`${data.deletedCount} rota(s) excluída(s)!`);
      setSelectedRouteIds([]);
      setSelectionMode(false);
      setDeleteDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedRouteIds, setSelectedRouteIds] = useState<number[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const deliveryUsers = deliverers.filter(
    (u) => u.role === "delivery" || (u as any).roles?.includes('"delivery"')
  );
  const monthOptions = getMonthOptions();

  const filteredRoutes = month === "all"
    ? routes
    : routes.filter((r) => {
        if (!r.deliveryDate) return false;
        const d = new Date(r.deliveryDate);
        const routeMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return routeMonth === month;
      });

  function toggleRouteSelection(id: number) {
    setSelectedRouteIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const isAdmin = user?.role !== "delivery";

  return (
    <div>
      <PageHeader
        title="Gerenciamento de Rotas"
        description="Acompanhe as rotas geradas e atribua os entregadores."
        actions={
          isAdmin ? (
            <div className="flex items-center gap-2">
              {selectionMode ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => {
                    if (selectedRouteIds.length === filteredRoutes.length) setSelectedRouteIds([]);
                    else setSelectedRouteIds(filteredRoutes.map(r => r.id));
                  }}>
                    {selectedRouteIds.length === filteredRoutes.length ? <CheckSquare className="w-4 h-4 mr-2" /> : <Square className="w-4 h-4 mr-2" />}
                    Todos
                  </Button>
                  {selectedRouteIds.length > 0 && (
                    <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                      <Trash2 className="w-4 h-4 mr-2" /> Excluir ({selectedRouteIds.length})
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { setSelectionMode(false); setSelectedRouteIds([]); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setSelectionMode(true)} disabled={filteredRoutes.length === 0}>
                    <CheckSquare className="w-4 h-4 mr-2" /> Selecionar
                  </Button>
                  <Link href="/admin/rotas/otimizar">
                    <Button className="bg-primary text-primary-foreground gap-2">
                      <Zap className="w-4 h-4" /> CRIAR ROTAS
                    </Button>
                  </Link>
                </>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={month} onValueChange={(v) => setMonth(v)}>
          <SelectTrigger className="w-48 bg-input">
            <Calendar className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : filteredRoutes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhuma rota encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRoutes.map((route) => {
            const isSelected = selectedRouteIds.includes(route.id);
            return (
              <Card key={route.id} className={`border-border transition-all ${selectionMode && isSelected ? "bg-primary/5 border-primary/30" : "bg-card"}`}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {selectionMode && (
                        <button onClick={() => toggleRouteSelection(route.id)} className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? "bg-primary border-primary" : "border-muted-foreground hover:border-primary"}`}>
                          {isSelected && <span className="text-primary-foreground text-xs">✓</span>}
                        </button>
                      )}
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Truck className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{route.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <StatusBadge status={route.status} />
                          {route.deliveryDate && <span className="text-xs text-muted-foreground">{new Date(route.deliveryDate).toLocaleDateString("pt-BR")}</span>}
                          {route.totalDistance && <span className="text-xs font-medium text-primary">· {parseFloat(route.totalDistance).toFixed(1)} km</span>}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Seletor de Entregador */}
                      {isAdmin && (
                        <div className="hidden md:block w-48">
                          <Select
                            value={String(route.deliveryUserId)}
                            onValueChange={(v) => assignDelivererMutation.mutate({ routeId: route.id, deliveryUserId: Number(v) })}
                          >
                            <SelectTrigger className="h-8 text-xs bg-muted/30">
                              <UserPlus className="w-3 h-3 mr-1.5" />
                              <SelectValue placeholder="Atribuir..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">Nenhum</SelectItem>
                              {deliveryUsers.map(u => (
                                <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="flex items-center gap-1">
                        {!selectionMode && isAdmin && route.status !== "completed" && (
                          <Button
                            size="sm" variant="outline" className="h-8 text-xs px-2 gap-1"
                            disabled={recalculateMutation.isPending}
                            title="Recalcula a ordem das paradas e as distâncias usando ruas reais"
                            onClick={() => recalculateMutation.mutate({ routeId: route.id })}
                          >
                            {recalculateMutation.isPending && recalculateMutation.variables?.routeId === route.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <RefreshCw className="w-3 h-3" />}
                            Recalcular
                          </Button>
                        )}
                        {!selectionMode && isAdmin && route.status === "planned" && (
                          <Button size="sm" variant="outline" className="h-8 text-xs px-2" onClick={() => updateStatusMutation.mutate({ id: route.id, status: "in_progress" })}>Iniciar</Button>
                        )}
                        {!selectionMode && (
                          <button onClick={() => setExpandedRoute(expandedRoute === route.id ? null : route.id)} className="text-muted-foreground hover:text-foreground p-1">
                            {expandedRoute === route.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {expandedRoute === route.id && (
                    <RouteDetail routeId={route.id} startingAddress={route.startingAddress || ""} />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Rotas</AlertDialogTitle>
            <AlertDialogDescription>Deseja excluir {selectedRouteIds.length} rota(s)? Os pedidos voltarão para "Em Produção".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteDialogOpen(false); if (!selectionMode) setSelectedRouteIds([]); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={() => deleteRoutesMutation.mutate({ routeIds: selectedRouteIds })}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RouteDetail({ routeId, startingAddress }: { routeId: number; startingAddress: string }) {
  const { data: route, isLoading } = trpc.delivery.routes.getById.useQuery({ id: routeId });

  if (isLoading) return <div className="mt-3 py-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>;
  if (!route) return null;

  // Lógica de quebra de links do Maps (max 10 paradas por link)
  const chunkSize = 10;
  const mapLinks: string[] = [];
  
  const buildAddr = (o: any) => {
    // Para Google Maps: apenas rua, número, bairro, cidade e CEP
    const parts = [o.customerStreet, o.customerNumber, o.customerNeighborhood, o.customerCity].filter(Boolean);
    if (o.customerZipCode) parts.push(o.customerZipCode);
    if (parts.length > 0) return parts.join(", ");
    // Fallback para deliveryAddress (que pode conter referência) — limpar parênteses
    if (o.deliveryAddress) return o.deliveryAddress.replace(/\s*\([^)]*\)/g, "").trim();
    return "";
  };

  for (let i = 0; i < route.orders.length; i += chunkSize) {
    const chunk = route.orders.slice(i, i + chunkSize);
    const origin = i === 0 ? encodeURIComponent(startingAddress) : encodeURIComponent(buildAddr(route.orders[i-1]));
    const dest = encodeURIComponent(buildAddr(chunk[chunk.length - 1]));
    const waypoints = chunk.slice(0, -1).map(o => encodeURIComponent(buildAddr(o))).join("|");
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`;
    if (waypoints) url += `&waypoints=${waypoints}`;
    mapLinks.push(url);
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      <div className="flex flex-wrap gap-2">
        {mapLinks.map((link, idx) => (
          <Button key={idx} size="sm" variant="outline" className="text-[10px] h-7 gap-1.5" onClick={() => window.open(link, "_blank")}>
            <ExternalLink className="w-3 h-3" /> MAPS {mapLinks.length > 1 ? `PARTE ${idx + 1}` : ""}
          </Button>
        ))}
      </div>
      
      <div className="space-y-1.5">
        {route.orders.map((o, idx) => (
          <div key={o.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 text-xs">
            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">{idx + 1}</div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{o.customerName}</p>
              <p className="text-[10px] text-muted-foreground truncate">{buildAddr(o)}</p>
            </div>
            <StatusBadge status={o.orderStatus ?? "production"} />
          </div>
        ))}
      </div>
    </div>
  );
}
