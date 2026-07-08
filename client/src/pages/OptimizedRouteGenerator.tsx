import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Zap, Users, Calendar, MapPin, Loader2, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, LayoutGrid, List, Info,
} from "lucide-react";

export default function OptimizedRouteGenerator() {
  const utils = trpc.useUtils();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [startingAddress, setStartingAddress] = useState(
    "Rua Eloi da Costa, 145, Luizote de Freitas, Uberlândia, MG"
  );
  const [selectedDeliverers, setSelectedDeliverers] = useState<number[]>([]);
  const [routeNamePrefix, setRouteNamePrefix] = useState("Rota Otimizada");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [generationResult, setGenerationResult] = useState<any>(null);

  // Seleção de pedidos
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [expandedNeighborhoods, setExpandedNeighborhoods] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"neighborhood" | "list">("neighborhood");

  const { data: deliverers = [] } = trpc.users.list.useQuery({ search: undefined });
  const { data: availableOrders = [], isLoading: isLoadingOrders } =
    trpc.routeOptimization.availableOrdersForPeriod.useQuery(
      { dateFrom, dateTo },
      { enabled: !!dateFrom && !!dateTo }
    );

  const generateMutation = trpc.routeOptimization.generateOptimizedRoutes.useMutation({
    onSuccess: (data) => {
      setGenerationResult(data);
      utils.delivery.routes.list.invalidate();
      utils.delivery.routes.availableOrders.invalidate({});
      toast.success("Rotas otimizadas geradas com sucesso!");
      setShowConfirmDialog(false);
      setDateFrom("");
      setDateTo("");
      setSelectedDeliverers([]);
      setSelectedOrderIds([]);
      setSelectAll(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deliveryUsers = deliverers.filter(
    (u) => u.role === "delivery" || (u as any).roles?.includes('"delivery"')
  );

  // Agrupa pedidos por bairro
  const ordersByNeighborhood = useMemo(() => {
    const map = new Map<string, typeof availableOrders>();
    for (const order of availableOrders) {
      const key = order.customerNeighborhood || "Sem bairro";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(order);
    }
    // Ordena bairros alfabeticamente
    const sortedEntries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return new Map(sortedEntries);
  }, [availableOrders]);

  // Pedidos efetivamente usados (selecionados ou todos se nenhum selecionado)
  const ordersToRoute = selectedOrderIds.length > 0
    ? availableOrders.filter((o) => selectedOrderIds.includes(o.id))
    : availableOrders;

  function toggleDeliverer(id: number) {
    setSelectedDeliverers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleOrder(id: number) {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleNeighborhood(neighborhood: string) {
    const neighborhoodOrders = ordersByNeighborhood.get(neighborhood) ?? [];
    const ids = neighborhoodOrders.map((o: { id: number }) => o.id);
    const allSelected = ids.every((id: number) => selectedOrderIds.includes(id));
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
    if (selectedDeliverers.length === 0) return toast.error("Selecione pelo menos um entregador.");
    if (ordersToRoute.length === 0) return toast.error("Nenhum pedido disponível no período.");
    setShowConfirmDialog(true);
  }

  function confirmGenerate() {
    generateMutation.mutate({
      dateFrom,
      dateTo,
      deliveryUserIds: selectedDeliverers,
      selectedOrderIds: selectedOrderIds.length > 0 ? selectedOrderIds : undefined,
      startingAddress,
      routeNamePrefix,
    });
  }

  const fmt = (v: string | number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

  const totalValue = ordersToRoute.reduce((sum, o) => sum + parseFloat(o.totalAmount), 0);

  return (
    <div>
      <PageHeader
        title="Gerador de Rotas Otimizadas"
        description="Roteirização inteligente com agrupamento por bairros e equilíbrio de quilometragem"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Configurações */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Configurações da Rota
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data Inicial *</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setSelectedOrderIds([]); setSelectAll(false); }}
                  className="bg-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Data Final *</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setSelectedOrderIds([]); setSelectAll(false); }}
                  className="bg-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Endereço de Saída</Label>
              <Input
                value={startingAddress}
                onChange={(e) => setStartingAddress(e.target.value)}
                className="bg-input text-sm"
                placeholder="Ex: Rua Eloi da Costa, 145, Luizote de Freitas, Uberlândia, MG"
              />
              <p className="text-xs text-muted-foreground">
                Ponto de partida para todas as rotas. O algoritmo usará o bairro para calcular distâncias.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Prefixo do Nome da Rota</Label>
              <Input
                value={routeNamePrefix}
                onChange={(e) => setRouteNamePrefix(e.target.value)}
                className="bg-input"
                placeholder="Ex: Rota Otimizada"
              />
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              Resumo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-1">Pedidos a Roteirizar</p>
              <p className="text-2xl font-bold text-primary">{ordersToRoute.length}</p>
              {selectedOrderIds.length > 0 && availableOrders.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  de {availableOrders.length} disponíveis
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Entregadores</p>
              <p className="text-2xl font-bold text-primary">{selectedDeliverers.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Valor Total</p>
              <p className="text-lg font-bold text-primary">{fmt(totalValue)}</p>
            </div>
            {selectedDeliverers.length > 0 && ordersToRoute.length > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-muted-foreground text-xs mb-1">Média por Entregador</p>
                <p className="text-sm font-semibold">
                  ~{Math.ceil(ordersToRoute.length / selectedDeliverers.length)} pedidos
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Entregadores */}
      <Card className="bg-card border-border mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Selecionar Entregadores ({selectedDeliverers.length} selecionados)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deliveryUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum entregador cadastrado.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {deliveryUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggleDeliverer(u.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
                    selectedDeliverers.includes(u.id)
                      ? "bg-primary/10 border-primary/30"
                      : "bg-muted/20 border-transparent hover:border-primary/20"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedDeliverers.includes(u.id)
                        ? "bg-primary border-primary"
                        : "border-muted-foreground"
                    }`}
                  >
                    {selectedDeliverers.includes(u.id) && (
                      <span className="text-primary-foreground text-xs">✓</span>
                    )}
                  </div>
                  <span className="text-sm font-medium">{u.name}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum pedido em produção no período selecionado.
              </p>
            ) : (
              <>
                {/* Barra de ações */}
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border">
                  <button
                    onClick={handleSelectAll}
                    className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-all border ${
                      selectAll || selectedOrderIds.length === availableOrders.length
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-muted/20 border-transparent hover:border-primary/20 text-muted-foreground"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                        selectAll || selectedOrderIds.length === availableOrders.length
                          ? "bg-primary border-primary"
                          : "border-muted-foreground"
                      }`}
                    >
                      {(selectAll || selectedOrderIds.length === availableOrders.length) && (
                        <span className="text-primary-foreground text-xs leading-none">✓</span>
                      )}
                    </div>
                    Selecionar todos
                  </button>
                  {selectedOrderIds.length > 0 && (
                    <button
                      onClick={() => { setSelectedOrderIds([]); setSelectAll(false); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Limpar seleção
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <Info className="w-3 h-3" />
                    {selectedOrderIds.length === 0
                      ? "Todos os pedidos serão incluídos"
                      : `${selectedOrderIds.length} pedido${selectedOrderIds.length !== 1 ? "s" : ""} selecionado${selectedOrderIds.length !== 1 ? "s" : ""}`}
                  </div>
                </div>

                {viewMode === "neighborhood" ? (
                  /* Visão agrupada por bairro */
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {Array.from(ordersByNeighborhood.entries()).map(([neighborhood, neighborhoodOrders]) => {
                      const ids = neighborhoodOrders.map((o) => o.id);
                      const selectedCount = ids.filter((id) => selectedOrderIds.includes(id)).length;
                      const allSelected = selectedCount === ids.length;
                      const someSelected = selectedCount > 0 && !allSelected;
                      const isExpanded = expandedNeighborhoods.has(neighborhood);

                      return (
                        <div key={neighborhood} className="border border-border rounded-xl overflow-hidden">
                          {/* Cabeçalho do bairro */}
                          <div className="flex items-center gap-3 p-3 bg-muted/10 hover:bg-muted/20 transition-colors">
                            <button
                              onClick={() => toggleNeighborhood(neighborhood)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                allSelected
                                  ? "bg-primary border-primary"
                                  : someSelected
                                  ? "bg-primary/40 border-primary"
                                  : "border-muted-foreground hover:border-primary"
                              }`}
                            >
                              {(allSelected || someSelected) && (
                                <span className="text-primary-foreground text-xs leading-none">
                                  {allSelected ? "✓" : "–"}
                                </span>
                              )}
                            </button>
                            <button
                              className="flex-1 flex items-center gap-2 text-left"
                              onClick={() => toggleNeighborhoodExpand(neighborhood)}
                            >
                              <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm font-medium">{neighborhood}</span>
                              <Badge variant="outline" className="text-xs ml-1">
                                {neighborhoodOrders.length} pedido{neighborhoodOrders.length !== 1 ? "s" : ""}
                              </Badge>
                              {selectedCount > 0 && (
                                <Badge className="text-xs bg-primary/10 border-primary/30 text-primary">
                                  {selectedCount} selecionado{selectedCount !== 1 ? "s" : ""}
                                </Badge>
                              )}
                              <span className="ml-auto text-muted-foreground">
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </span>
                            </button>
                          </div>

                          {/* Pedidos do bairro */}
                          {isExpanded && (
                            <div className="divide-y divide-border">
                              {neighborhoodOrders.map((o) => {
                                const selected = selectedOrderIds.includes(o.id);
                                const addr = o.deliveryAddress ||
                                  [o.customerStreet, o.customerNumber, o.customerNeighborhood]
                                    .filter(Boolean)
                                    .join(", ");
                                return (
                                  <button
                                    key={o.id}
                                    onClick={() => toggleOrder(o.id)}
                                    className={`w-full flex items-center gap-3 p-3 text-left transition-all ${
                                      selected ? "bg-primary/5" : "hover:bg-muted/10"
                                    }`}
                                  >
                                    <div
                                      className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                        selected ? "bg-primary border-primary" : "border-muted-foreground"
                                      }`}
                                    >
                                      {selected && (
                                        <span className="text-primary-foreground text-xs leading-none">✓</span>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium">{o.customerName}</p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {addr || "Sem endereço"}
                                      </p>
                                    </div>
                                    <span className="text-sm font-semibold text-primary flex-shrink-0">
                                      {fmt(o.totalAmount)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Visão de lista simples */
                  <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                    {availableOrders.map((o) => {
                      const selected = selectedOrderIds.includes(o.id);
                      const addr = o.deliveryAddress ||
                        [o.customerStreet, o.customerNumber, o.customerNeighborhood]
                          .filter(Boolean)
                          .join(", ");
                      return (
                        <button
                          key={o.id}
                          onClick={() => toggleOrder(o.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
                            selected
                              ? "bg-primary/10 border-primary/30"
                              : "bg-muted/20 border-transparent hover:border-primary/20"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                              selected ? "bg-primary border-primary" : "border-muted-foreground"
                            }`}
                          >
                            {selected && (
                              <span className="text-primary-foreground text-xs">✓</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{o.customerName}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground truncate">
                                {addr || "Sem endereço"}
                              </p>
                              {o.customerNeighborhood && (
                                <Badge variant="outline" className="text-xs flex-shrink-0">
                                  {o.customerNeighborhood}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-primary flex-shrink-0">
                            {fmt(o.totalAmount)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Botão Gerar */}
      <div className="flex gap-3 mt-6">
        <Button
          onClick={handleGenerate}
          className="bg-primary text-primary-foreground gap-2 flex-1"
          disabled={
            !dateFrom ||
            !dateTo ||
            selectedDeliverers.length === 0 ||
            availableOrders.length === 0
          }
        >
          <Zap className="w-4 h-4" />
          Gerar Rotas Otimizadas
          {ordersToRoute.length > 0 && selectedDeliverers.length > 0 && (
            <span className="ml-1 opacity-80">
              ({ordersToRoute.length} pedidos ÷ {selectedDeliverers.length} entregador{selectedDeliverers.length !== 1 ? "es" : ""})
            </span>
          )}
        </Button>
      </div>

      {/* Diálogo de Confirmação */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Geração de Rotas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              O sistema irá criar{" "}
              <strong>{selectedDeliverers.length}</strong> rota{selectedDeliverers.length !== 1 ? "s" : ""}{" "}
              com <strong>{ordersToRoute.length}</strong> pedido{ordersToRoute.length !== 1 ? "s" : ""}.
            </p>

            <div className="bg-muted/20 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Como funciona a otimização:
              </p>
              <ul className="text-xs space-y-1.5 text-muted-foreground">
                <li className="flex items-start gap-1.5">
                  <span className="text-primary font-bold mt-0.5">1.</span>
                  <span>
                    <strong>Agrupamento geográfico:</strong> pedidos do mesmo bairro ou região ficam na mesma rota.
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-primary font-bold mt-0.5">2.</span>
                  <span>
                    <strong>Equilíbrio de KM:</strong> quem vai mais longe recebe menos paradas para que todos rodem distâncias similares.
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-primary font-bold mt-0.5">3.</span>
                  <span>
                    <strong>Caminho lógico:</strong> as paradas são ordenadas para evitar idas e voltas desnecessárias.
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-muted/20 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Detalhes:</p>
              <p className="text-xs text-muted-foreground">
                • Período: {dateFrom ? new Date(dateFrom + "T12:00:00").toLocaleDateString("pt-BR") : "—"} a{" "}
                {dateTo ? new Date(dateTo + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
              </p>
              <p className="text-xs text-muted-foreground">• Saída: {startingAddress}</p>
              {selectedOrderIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  • Pedidos selecionados manualmente: {selectedOrderIds.length}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmGenerate}
              className="bg-primary text-primary-foreground"
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Zap className="w-4 h-4 mr-1" />
              )}
              Gerar Rotas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resultado */}
      {generationResult && (
        <Card className="bg-card border-border mt-6 border-green-500/30 bg-green-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              Rotas Geradas com Sucesso!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-muted-foreground text-xs mb-1">Rotas Criadas</p>
                <p className="text-2xl font-bold text-green-600">{generationResult.totalRoutes}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Pedidos Distribuídos</p>
                <p className="text-2xl font-bold text-green-600">{generationResult.totalOrders}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Média por Rota</p>
                <p className="text-2xl font-bold text-green-600">
                  {Math.round(generationResult.totalOrders / generationResult.totalRoutes)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {generationResult.routesCreated.map((route: any, idx: number) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-muted/20 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{route.deliveryUserName}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{route.orderCount} pedido{route.orderCount !== 1 ? "s" : ""}</span>
                      <span className="font-semibold text-primary">
                        ~{route.estimatedDistance.toFixed(1)} km
                      </span>
                    </div>
                  </div>
                  {route.neighborhoods && route.neighborhoods.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {route.neighborhoods.map((n: string) => (
                        <Badge key={n} variant="outline" className="text-xs">
                          {n}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Equilíbrio de KM */}
            {generationResult.routesCreated.length > 1 && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Equilíbrio de quilometragem:</p>
                {generationResult.routesCreated.map((route: any, idx: number) => {
                  const maxKm = Math.max(...generationResult.routesCreated.map((r: any) => r.estimatedDistance));
                  const pct = maxKm > 0 ? (route.estimatedDistance / maxKm) * 100 : 0;
                  return (
                    <div key={idx} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs w-24 truncate text-muted-foreground">
                        {route.deliveryUserName.split(" ")[0]}
                      </span>
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div
                          className="bg-primary rounded-full h-2 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-14 text-right">
                        {route.estimatedDistance.toFixed(1)} km
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
