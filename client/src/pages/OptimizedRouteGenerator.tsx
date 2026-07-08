import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Zap, Calendar, MapPin, Loader2, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, LayoutGrid, List, Info, Truck,
  CheckSquare, Square, X, Filter,
} from "lucide-react";
import { useLocation } from "wouter";

export default function OptimizedRouteGenerator() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deliveryMethodId, setDeliveryMethodId] = useState<string>("all");
  const [numRoutes, setNumRoutes] = useState(1);
  const [startingAddress, setStartingAddress] = useState(
    "Rua Eloi da Costa, 145, Luizote de Freitas, Uberlândia, MG"
  );
  const [routeNamePrefix, setRouteNamePrefix] = useState("Rota Otimizada");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  // Seleção de pedidos
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [expandedNeighborhoods, setExpandedNeighborhoods] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"neighborhood" | "list">("neighborhood");

  const { data: deliveryMethods = [] } = trpc.delivery.methods.list.useQuery();
  const { data: availableOrders = [], isLoading: isLoadingOrders } =
    trpc.routeOptimization.availableOrdersForPeriod.useQuery(
      { 
        dateFrom, 
        dateTo, 
        deliveryMethodId: deliveryMethodId === "all" ? undefined : Number(deliveryMethodId) 
      },
      { enabled: !!dateFrom && !!dateTo }
    );

  const generateMutation = trpc.routeOptimization.generateOptimizedRoutes.useMutation({
    onSuccess: () => {
      utils.delivery.routes.list.invalidate();
      utils.delivery.routes.availableOrders.invalidate({});
      toast.success("Rotas otimizadas geradas com sucesso!");
      setShowConfirmDialog(false);
      setLocation("/admin/rotas"); // Redireciona para a lista para atribuir entregadores
    },
    onError: (e) => toast.error(e.message),
  });

  // Agrupa pedidos por bairro
  const ordersByNeighborhood = useMemo(() => {
    const map = new Map<string, typeof availableOrders>();
    for (const order of availableOrders) {
      const key = order.customerNeighborhood || "Sem bairro";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(order);
    }
    return new Map(Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])));
  }, [availableOrders]);

  const ordersToRoute = selectedOrderIds.length > 0
    ? availableOrders.filter((o) => selectedOrderIds.includes(o.id))
    : availableOrders;

  function toggleOrder(id: number) {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleNeighborhood(neighborhood: string) {
    const neighborhoodOrders = ordersByNeighborhood.get(neighborhood) ?? [];
    const ids = neighborhoodOrders.map((o) => o.id);
    const allSelected = ids.every((id) => selectedOrderIds.includes(id));
    if (allSelected) {
      setSelectedOrderIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      const combined = [...selectedOrderIds, ...ids];
      const unique = combined.filter((v, i, a) => a.indexOf(v) === i);
      setSelectedOrderIds(unique);
    }
  }

  function handleSelectAll() {
    if (selectAll) {
      setSelectedOrderIds([]);
      setSelectAll(false);
    } else {
      setSelectedOrderIds(availableOrders.map((o) => o.id));
      setSelectAll(true);
    }
  }

  function toggleNeighborhoodExpand(neighborhood: string) {
    setExpandedNeighborhoods((prev) => {
      const next = new Set(prev);
      if (next.has(neighborhood)) next.delete(neighborhood);
      else next.add(neighborhood);
      return next;
    });
  }

  function handleGenerate() {
    if (!dateFrom) return toast.error("Informe a data inicial.");
    if (!dateTo) return toast.error("Informe a data final.");
    if (ordersToRoute.length === 0) return toast.error("Selecione pelo menos um pedido.");
    setShowConfirmDialog(true);
  }

  function confirmGenerate() {
    generateMutation.mutate({
      selectedOrderIds: ordersToRoute.map(o => o.id),
      numRoutes,
      startingAddress,
      routeNamePrefix,
    });
  }

  const fmt = (v: string | number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

  const totalValue = ordersToRoute.reduce((sum, o) => sum + parseFloat(o.totalAmount), 0);

  return (
    <div className="pb-10">
      <PageHeader
        title="Criar Rotas Otimizadas"
        description="Filtre pedidos, selecione os endereços e defina a quantidade de rotas."
        actions={
          <Button variant="ghost" onClick={() => setLocation("/admin/rotas")}>
            <X className="w-4 h-4 mr-2" /> Cancelar
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Filtros e Configurações */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              Filtros de Pedidos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Data Inicial</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setSelectedOrderIds([]); }}
                  className="bg-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Data Final</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setSelectedOrderIds([]); }}
                  className="bg-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Entrega</Label>
                <Select value={deliveryMethodId} onValueChange={(v) => { setDeliveryMethodId(v); setSelectedOrderIds([]); }}>
                  <SelectTrigger className="bg-input">
                    <SelectValue placeholder="Todos os tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    {deliveryMethods.map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <CardTitle className="text-sm flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-primary" />
                Parâmetros de Geração
              </CardTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quantidade de Rotas a Criar</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={numRoutes}
                      onChange={(e) => setNumRoutes(Number(e.target.value))}
                      className="bg-input w-24"
                    />
                    <p className="text-xs text-muted-foreground">
                      Os pedidos serão divididos em {numRoutes} rotas com KM equilibrado.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Prefixo do Nome</Label>
                  <Input
                    value={routeNamePrefix}
                    onChange={(e) => setRouteNamePrefix(e.target.value)}
                    className="bg-input"
                    placeholder="Ex: Rota Otimizada"
                  />
                </div>
                <div className="col-span-1 md:col-span-2 space-y-2">
                  <Label>Endereço de Saída</Label>
                  <Input
                    value={startingAddress}
                    onChange={(e) => setStartingAddress(e.target.value)}
                    className="bg-input text-sm"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              Resumo da Seleção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-1">Pedidos Selecionados</p>
              <p className="text-2xl font-bold text-primary">{ordersToRoute.length}</p>
              <p className="text-xs text-muted-foreground">
                de {availableOrders.length} filtrados
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Média por Rota</p>
              <p className="text-lg font-semibold">
                ~{Math.ceil(ordersToRoute.length / numRoutes)} paradas
              </p>
              <p className="text-xs text-muted-foreground">Distribuídas por proximidade e KM</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Valor Total</p>
              <p className="text-lg font-bold text-primary">{fmt(totalValue)}</p>
            </div>
            
            <Button
              onClick={handleGenerate}
              className="w-full bg-primary text-primary-foreground gap-2"
              disabled={ordersToRoute.length === 0 || generateMutation.isPending}
            >
              {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Gerar {numRoutes} Rota{numRoutes > 1 ? "s" : ""}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Seleção de Pedidos */}
      {dateFrom && dateTo && (
        <Card className="bg-card border-border mt-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Pedidos Disponíveis ({availableOrders.length})
                {selectedOrderIds.length > 0 && (
                  <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30 text-primary">
                    {selectedOrderIds.length} selecionados
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode(viewMode === "neighborhood" ? "list" : "neighborhood")}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  title={viewMode === "neighborhood" ? "Ver como lista" : "Agrupar por bairro"}
                >
                  {viewMode === "neighborhood" ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingOrders ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : availableOrders.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-muted-foreground">Nenhum pedido encontrado para o período e filtros selecionados.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
                  <button
                    onClick={handleSelectAll}
                    className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-all border ${
                      selectAll || selectedOrderIds.length === availableOrders.length
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-muted/20 border-transparent hover:border-primary/20 text-muted-foreground"
                    }`}
                  >
                    {selectAll || selectedOrderIds.length === availableOrders.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    Selecionar todos
                  </button>
                  {selectedOrderIds.length > 0 && (
                    <button
                      onClick={() => { setSelectedOrderIds([]); setSelectAll(false); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Limpar seleção
                    </button>
                  )}
                </div>

                {viewMode === "neighborhood" ? (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {Array.from(ordersByNeighborhood.entries()).map(([neighborhood, neighborhoodOrders]) => {
                      const ids = neighborhoodOrders.map((o) => o.id);
                      const selectedCount = ids.filter((id) => selectedOrderIds.includes(id)).length;
                      const allSelected = selectedCount === ids.length;
                      const someSelected = selectedCount > 0 && !allSelected;
                      const isExpanded = expandedNeighborhoods.has(neighborhood);

                      return (
                        <div key={neighborhood} className="border border-border rounded-xl overflow-hidden">
                          <div className="flex items-center gap-3 p-3 bg-muted/10">
                            <button
                              onClick={() => toggleNeighborhood(neighborhood)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                allSelected ? "bg-primary border-primary" : someSelected ? "bg-primary/40 border-primary" : "border-muted-foreground"
                              }`}
                            >
                              {(allSelected || someSelected) && <span className="text-primary-foreground text-xs">{allSelected ? "✓" : "–"}</span>}
                            </button>
                            <button
                              className="flex-1 flex items-center gap-2 text-left"
                              onClick={() => toggleNeighborhoodExpand(neighborhood)}
                            >
                              <span className="text-sm font-medium">{neighborhood}</span>
                              <Badge variant="outline" className="text-xs">{neighborhoodOrders.length}</Badge>
                              <span className="ml-auto text-muted-foreground">
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </span>
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="divide-y divide-border">
                              {neighborhoodOrders.map((o) => (
                                <button
                                  key={o.id}
                                  onClick={() => toggleOrder(o.id)}
                                  className={`w-full flex items-center gap-3 p-3 text-left transition-all ${selectedOrderIds.includes(o.id) ? "bg-primary/5" : "hover:bg-muted/10"}`}
                                >
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${selectedOrderIds.includes(o.id) ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                                    {selectedOrderIds.includes(o.id) && <span className="text-primary-foreground text-xs">✓</span>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{o.customerName}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {o.deliveryAddress || `${o.customerStreet}, ${o.customerNumber}`}
                                    </p>
                                  </div>
                                  <Badge variant="secondary" className="text-[10px]">{o.deliveryMethodName}</Badge>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                    {availableOrders.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => toggleOrder(o.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl text-left border ${selectedOrderIds.includes(o.id) ? "bg-primary/10 border-primary/30" : "bg-muted/20 border-transparent hover:border-primary/20"}`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${selectedOrderIds.includes(o.id) ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                          {selectedOrderIds.includes(o.id) && <span className="text-primary-foreground text-xs">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{o.customerName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {o.customerNeighborhood} · {o.deliveryAddress || `${o.customerStreet}, ${o.customerNumber}`}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">{o.deliveryMethodName}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmação */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Confirmar Geração</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Você está prestes a criar <strong>{numRoutes}</strong> rota{numRoutes > 1 ? "s" : ""} para <strong>{ordersToRoute.length}</strong> pedido{ordersToRoute.length > 1 ? "s" : ""}.
            </p>
            <div className="bg-muted/20 p-3 rounded-lg space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">O que o sistema fará:</p>
              <ul className="text-xs space-y-1.5 text-muted-foreground">
                <li className="flex gap-2">✅ <strong>Agrupamento:</strong> Pedidos próximos ficarão na mesma rota.</li>
                <li className="flex gap-2">✅ <strong>Equilíbrio:</strong> As rotas terão KM rodado semelhante.</li>
                <li className="flex gap-2">✅ <strong>Links Maps:</strong> Gerará links quebrados a cada 10 paradas.</li>
                <li className="flex gap-2">⚠️ <strong>Entregadores:</strong> Você deverá atribuir os entregadores na tela seguinte.</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>Voltar</Button>
            <Button onClick={confirmGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
              Confirmar e Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
