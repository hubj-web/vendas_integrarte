import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, MapPin, Truck, ExternalLink, ChevronDown, ChevronUp, Loader2, GripVertical, Calendar, Zap } from "lucide-react";
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
  const { data: availableOrders = [] } = trpc.delivery.routes.availableOrders.useQuery({});
  const { data: deliverers = [] } = trpc.users.list.useQuery({ search: undefined });

  const createMutation = trpc.delivery.routes.create.useMutation({
    onSuccess: () => { utils.delivery.routes.list.invalidate(); utils.delivery.routes.availableOrders.invalidate({}); toast.success("Rota criada!"); setCreateOpen(false); setSelectedOrders([]); },
    onError: e => toast.error(e.message),
  });
  const updateStatusMutation = trpc.delivery.routes.updateStatus.useMutation({
    onSuccess: () => { utils.delivery.routes.list.invalidate(); toast.success("Status atualizado!"); },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const [routeForm, setRouteForm] = useState({ name: "", deliveryDate: "", deliveryUserId: "", startingAddress: "Rua Eloi da Costa, 145, Luizote de Freitas, Uberlândia, MG" });
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);

  const deliveryUsers = deliverers.filter(u => u.role === "delivery" || (u as any).roles?.includes('"delivery"'));

  const monthOptions = getMonthOptions();

  // Filter routes by month
  const filteredRoutes = month === "all" ? routes : routes.filter(r => {
    if (!r.deliveryDate) return false;
    const d = new Date(r.deliveryDate);
    const routeMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return routeMonth === month;
  });

  function toggleOrder(id: number) {
    setSelectedOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function openGoogleMaps(orders: any[]) {
    const addresses = orders
      .map(o => o.deliveryAddress || [o.customerStreet, o.customerNumber, o.customerNeighborhood, o.customerCity].filter(Boolean).join(", "))
      .filter(Boolean);
    if (addresses.length === 0) return toast.error("Nenhum endereço disponível para abrir no mapa.");
    const origin = addresses[0];
    const destination = addresses[addresses.length - 1];
    const waypoints = addresses.slice(1, -1).join("|");
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`;
    window.open(url, "_blank");
  }

  const fmt = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(v));

  return (
    <div>
      <PageHeader
        title="Rotas de Entrega"
        description="Organize e acompanhe as rotas de entrega"
        actions={
          user?.role !== "delivery" ? (
            <div className="flex items-center gap-2">
              <Link href="/admin/rotas/otimizar">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                  <Zap className="w-4 h-4" />Gerar Rotas Otimizadas
                </Button>
              </Link>
              <Button onClick={() => setCreateOpen(true)} className="bg-primary text-primary-foreground gap-2">
                <Plus className="w-4 h-4" />Nova Rota
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Month filter */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={month} onValueChange={v => setMonth(v)}>
          <SelectTrigger className="w-48 bg-input"><Calendar className="w-3.5 h-3.5 mr-1 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent>{monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        {month !== "all" && (
          <p className="text-sm text-muted-foreground self-center">{filteredRoutes.length} rota{filteredRoutes.length !== 1 ? "s" : ""} encontrada{filteredRoutes.length !== 1 ? "s" : ""}</p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : filteredRoutes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhuma rota encontrada{month !== "all" ? " neste mês" : ""}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRoutes.map(route => (
            <Card key={route.id} className="bg-card border-border">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Truck className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{route.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StatusBadge status={route.status} />
                        <span className="text-xs text-muted-foreground">{route.deliveryUserName ?? "Sem entregador"}</span>
                        {route.deliveryDate && <span className="text-xs text-muted-foreground">· {new Date(route.deliveryDate).toLocaleDateString("pt-BR")}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {user?.role !== "delivery" && route.status === "planned" && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => updateStatusMutation.mutate({ id: route.id, status: "in_progress" })}>
                        Iniciar
                      </Button>
                    )}
                    {route.status === "in_progress" && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => updateStatusMutation.mutate({ id: route.id, status: "completed" })}>
                        Concluir
                      </Button>
                    )}
                    <button onClick={() => setExpandedRoute(expandedRoute === route.id ? null : route.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {expandedRoute === route.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {expandedRoute === route.id && <RouteDetail routeId={route.id} onOpenMaps={openGoogleMaps} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create route dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Rota de Entrega</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-2"><Label>Nome da Rota *</Label><Input value={routeForm.name} onChange={e => setRouteForm(f => ({ ...f, name: e.target.value }))} className="bg-input" placeholder="Ex: Rota Centro - Manhã" /></div>
              <div className="space-y-2">
                <Label>Data de Entrega *</Label>
                <Input type="date" value={routeForm.deliveryDate} onChange={e => setRouteForm(f => ({ ...f, deliveryDate: e.target.value }))} className="bg-input" />
              </div>
              <div className="space-y-2">
                <Label>Entregador *</Label>
                <Select value={routeForm.deliveryUserId} onValueChange={v => setRouteForm(f => ({ ...f, deliveryUserId: v }))}>
                  <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {deliveryUsers.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Endereço de Saída</Label>
                <Input value={routeForm.startingAddress} onChange={e => setRouteForm(f => ({ ...f, startingAddress: e.target.value }))} className="bg-input" placeholder="Endereço de saída para a rota" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Selecionar Pedidos ({selectedOrders.length} selecionados)</Label>
              {availableOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum pedido disponível para rota.</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {availableOrders.map(o => {
                    const selected = selectedOrders.includes(o.id);
                    const addr = o.deliveryAddress || [o.customerStreet, o.customerNumber, o.customerNeighborhood].filter(Boolean).join(", ");
                    return (
                      <button key={o.id} onClick={() => toggleOrder(o.id)} className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${selected ? "bg-primary/10 border-primary/30" : "bg-muted/20 border-transparent hover:border-primary/20"}`}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${selected ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                          {selected && <span className="text-primary-foreground text-xs">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{o.customerName}</p>
                          <p className="text-xs text-muted-foreground truncate">{addr || "Sem endereço"}</p>
                        </div>
                        <span className="text-sm font-semibold text-primary flex-shrink-0">{fmt(o.totalAmount)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!routeForm.name) return toast.error("Informe o nome da rota.");
                if (!routeForm.deliveryDate) return toast.error("Informe a data.");
                if (!routeForm.deliveryUserId) return toast.error("Selecione um entregador.");
                if (selectedOrders.length === 0) return toast.error("Selecione ao menos um pedido.");
                createMutation.mutate({ name: routeForm.name, deliveryDate: routeForm.deliveryDate, deliveryUserId: Number(routeForm.deliveryUserId), orderIds: selectedOrders, startingAddress: routeForm.startingAddress });
              }}
              className="bg-primary text-primary-foreground"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Criar Rota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RouteDetail({ routeId, onOpenMaps }: { routeId: number; onOpenMaps: (orders: any[]) => void }) {
  const { data: route, isLoading } = trpc.delivery.routes.getById.useQuery({ id: routeId });

  if (isLoading) return <div className="mt-3 py-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>;
  if (!route) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{route.orders.length} parada{route.orders.length !== 1 ? "s" : ""}</p>
        <Button size="sm" variant="outline" className="text-xs gap-1.5 h-7" onClick={() => onOpenMaps(route.orders)}>
          <ExternalLink className="w-3 h-3" />Abrir no Maps
        </Button>
      </div>
      {route.orders.map((o, idx) => {
        const addr = o.deliveryAddress || [o.customerStreet, o.customerNumber, o.customerNeighborhood, o.customerCity].filter(Boolean).join(", ");
        return (
          <div key={o.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary">{idx + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{o.customerName}</p>
              <p className="text-xs text-muted-foreground truncate">{addr || "Sem endereço"}</p>
            </div>
            <StatusBadge status={o.orderStatus ?? "production"} />
          </div>
        );
      })}
    </div>
  );
}
