import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Zap, Users, Calendar, MapPin, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useLocalAuth } from "@/hooks/useLocalAuth";

export default function OptimizedRouteGenerator() {
  const { user } = useLocalAuth();
  const utils = trpc.useUtils();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [startingAddress, setStartingAddress] = useState("Rua Eloi da Costa, 145, Luizote de Freitas, Uberlândia, MG");
  const [selectedDeliverers, setSelectedDeliverers] = useState<number[]>([]);
  const [routeNamePrefix, setRouteNamePrefix] = useState("Rota Otimizada");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [generationResult, setGenerationResult] = useState<any>(null);

  const { data: deliverers = [] } = trpc.users.list.useQuery({ search: undefined });
  const { data: availableOrders = [], isLoading: isLoadingOrders } = trpc.routeOptimization.availableOrdersForPeriod.useQuery(
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
    },
    onError: (e) => toast.error(e.message),
  });

  const deliveryUsers = deliverers.filter(u => u.role === "delivery" || (u as any).roles?.includes('"delivery"'));

  function toggleDeliverer(id: number) {
    setSelectedDeliverers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function handleGenerate() {
    if (!dateFrom) {
      toast.error("Informe a data inicial.");
      return;
    }
    if (!dateTo) {
      toast.error("Informe a data final.");
      return;
    }
    if (selectedDeliverers.length === 0) {
      toast.error("Selecione pelo menos um entregador.");
      return;
    }
    if (availableOrders.length === 0) {
      toast.error("Nenhum pedido disponível no período.");
      return;
    }

    setShowConfirmDialog(true);
  }

  function confirmGenerate() {
    generateMutation.mutate({
      dateFrom,
      dateTo,
      deliveryUserIds: selectedDeliverers,
      startingAddress,
      routeNamePrefix,
    });
  }

  const fmt = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(v));

  return (
    <div>
      <PageHeader
        title="Gerador de Rotas Otimizadas"
        description="Crie rotas automaticamente otimizadas por distância para seus entregadores"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Filtros */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Período de Entrega
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data Inicial *</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Data Final *</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
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
              <p className="text-xs text-muted-foreground">Este será o ponto de partida para todas as rotas.</p>
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
              <p className="text-muted-foreground text-xs mb-1">Pedidos Disponíveis</p>
              <p className="text-2xl font-bold text-primary">{availableOrders.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Entregadores Selecionados</p>
              <p className="text-2xl font-bold text-primary">{selectedDeliverers.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Valor Total</p>
              <p className="text-lg font-bold text-primary">
                {fmt(availableOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount), 0).toString())}
              </p>
            </div>
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
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum entregador cadastrado.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {deliveryUsers.map(u => (
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

      {/* Pedidos Disponíveis */}
      {dateFrom && dateTo && (
        <Card className="bg-card border-border mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Pedidos Disponíveis ({availableOrders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingOrders ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : availableOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum pedido em produção no período selecionado.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableOrders.map(o => {
                  const addr = o.deliveryAddress || [o.customerStreet, o.customerNumber, o.customerNeighborhood].filter(Boolean).join(", ");
                  return (
                    <div key={o.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{o.customerName}</p>
                        <p className="text-xs text-muted-foreground truncate">{addr || "Sem endereço"}</p>
                      </div>
                      <span className="text-sm font-semibold text-primary flex-shrink-0">{fmt(o.totalAmount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Botão Gerar */}
      <div className="flex gap-3 mt-6">
        <Button
          onClick={handleGenerate}
          className="bg-primary text-primary-foreground gap-2 flex-1"
          disabled={!dateFrom || !dateTo || selectedDeliverers.length === 0 || availableOrders.length === 0}
        >
          <Zap className="w-4 h-4" />
          Gerar Rotas Otimizadas
        </Button>
      </div>

      {/* Diálogo de Confirmação */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Geração de Rotas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Você está prestes a gerar <strong>{availableOrders.length}</strong> rotas otimizadas para{" "}
              <strong>{selectedDeliverers.length}</strong> entregador{selectedDeliverers.length !== 1 ? "es" : ""}.
            </p>
            <div className="bg-muted/20 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Resumo:</p>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>• Período: {new Date(dateFrom).toLocaleDateString("pt-BR")} a {new Date(dateTo).toLocaleDateString("pt-BR")}</li>
                <li>• Endereço de saída: {startingAddress}</li>
                <li>• Pedidos a distribuir: {availableOrders.length}</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              As rotas serão otimizadas para equilibrar a distância percorrida por cada entregador.
            </p>
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
              ) : null}
              Confirmar
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
                <p className="text-muted-foreground text-xs mb-1">Total de Rotas</p>
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
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 text-xs">
                  <span className="font-medium">{route.deliveryUserName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{route.orderCount} pedidos</span>
                    <span className="text-muted-foreground">{route.estimatedDistance.toFixed(1)} km</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
