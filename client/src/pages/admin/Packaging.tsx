import { useState, useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Package, MapPin, Phone, PackageCheck, PackageOpen, Truck, Eye, HandHelping } from "lucide-react";

type PackagingItem = {
  orderId: number | null;
  status: string | null;
  deliveryMethodId: number | null;
  deliveryMethodName: string | null;
  deliveryAddress: string | null;
  notes: string | null;
  customerName: string | null;
  customerPhone: string | null;
  items: { label: string; quantity: number }[];
};

function OrderPackagingCard({
  order, onToggle, isPending,
}: {
  order: PackagingItem;
  onToggle: (orderId: number, currentlyPackaged: boolean) => void;
  isPending: boolean;
}) {
  const packaged = order.status === "packaged";
  return (
    <div className={`rounded-xl border p-4 transition-all ${packaged ? "bg-green-50 border-green-200" : "bg-card"}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/admin/pedidos/${order.orderId}`} className="font-bold text-foreground hover:text-primary hover:underline flex items-center gap-1">
              Pedido #{order.orderId}
              <Eye className="w-3 h-3" />
            </Link>
            <span className="font-semibold text-foreground">{order.customerName}</span>
            {packaged
              ? <Badge className="bg-green-600 hover:bg-green-600 gap-1"><PackageCheck className="w-3 h-3" /> Empacotado</Badge>
              : <Badge variant="secondary" className="gap-1"><PackageOpen className="w-3 h-3" /> Pendente</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
            {order.customerPhone && (
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {order.customerPhone}</span>
            )}
            {order.deliveryAddress && (
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {order.deliveryAddress}</span>
            )}
            {order.deliveryMethodName && (
              <span>{order.deliveryMethodName}</span>
            )}
          </div>
        </div>
        <label className="flex items-center gap-2 flex-shrink-0 cursor-pointer select-none">
          <Checkbox
            checked={packaged}
            disabled={isPending}
            onCheckedChange={() => onToggle(order.orderId!, packaged)}
          />
          <span className="text-sm text-muted-foreground">Embalado</span>
        </label>
      </div>

      {order.items.length > 0 ? (
        <ul className="space-y-1 pl-1">
          {order.items.map((item, idx) => (
            <li key={idx} className="flex items-center justify-between text-sm border-b border-dashed border-border/60 py-1 last:border-0">
              <span className="text-foreground">{item.label}</span>
              <span className="font-medium text-muted-foreground">{item.quantity}x</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground italic">Nenhum item encontrado para este pedido.</p>
      )}

      {order.notes && (
        <p className="text-xs text-muted-foreground mt-2 italic">Obs: {order.notes}</p>
      )}
    </div>
  );
}

export default function Packaging() {
  const utils = trpc.useUtils();
  const [deliveryMethodId, setDeliveryMethodId] = useState<string>("all");
  const [routeId, setRouteId] = useState<string>("");
  const [directMethodId, setDirectMethodId] = useState<string>("all");

  const { data: deliveryMethods = [] } = trpc.catalog.deliveryMethods.list.useQuery();

  const { data: routesList = [], isLoading: loadingRoutes } = trpc.packaging.routes.useQuery({
    deliveryMethodId: deliveryMethodId !== "all" ? Number(deliveryMethodId) : undefined,
  });

  // Se a rota selecionada some da lista (ex: mudou o filtro), reseta a seleção.
  useEffect(() => {
    if (routeId && !routesList.some(r => String(r.id) === routeId)) {
      setRouteId("");
    }
  }, [routesList, routeId]);

  const { data: detail, isLoading: loadingDetail } = trpc.packaging.routeDetail.useQuery(
    { routeId: Number(routeId), deliveryMethodId: deliveryMethodId !== "all" ? Number(deliveryMethodId) : undefined },
    { enabled: !!routeId }
  );

  const { data: directOrders = [], isLoading: loadingDirect } = trpc.packaging.directOrders.useQuery({
    deliveryMethodId: directMethodId !== "all" ? Number(directMethodId) : undefined,
  });

  const setPackagedMutation = trpc.packaging.setPackaged.useMutation({
    onSuccess: () => {
      utils.packaging.routeDetail.invalidate();
      utils.packaging.routes.invalidate();
      utils.packaging.directOrders.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function toggle(orderId: number, currentlyPackaged: boolean) {
    setPackagedMutation.mutate({ orderId, packaged: !currentlyPackaged });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Empacotamento"
        description="Prepare os pacotes de cada pedido — por rota de entrega ou avulsos (retirada/entrega na mão)"
      />

      <Tabs defaultValue="route">
        <TabsList className="bg-muted/30 mb-6">
          <TabsTrigger value="route" className="gap-1.5"><Truck className="w-3.5 h-3.5" /> Por Rota</TabsTrigger>
          <TabsTrigger value="direct" className="gap-1.5"><HandHelping className="w-3.5 h-3.5" /> Sem Rota</TabsTrigger>
        </TabsList>

        <TabsContent value="route">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                1. Tipo de entrega a preparar
              </label>
              <Select value={deliveryMethodId} onValueChange={setDeliveryMethodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo de entrega" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {deliveryMethods.map(dm => (
                    <SelectItem key={dm.id} value={String(dm.id)}>{dm.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                2. Rota de entrega
              </label>
              <Select value={routeId} onValueChange={setRouteId} disabled={routesList.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingRoutes ? "Carregando..." : "Selecione a rota"} />
                </SelectTrigger>
                <SelectContent>
                  {routesList.map(r => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name} — {r.packagedOrders}/{r.totalOrders} embalados
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!loadingRoutes && routesList.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Nenhuma rota disponível para empacotamento</p>
              <p className="text-sm mt-1">
                É necessário criar uma rota de entrega (em Rotas de Entrega) com pedidos deste tipo antes de empacotar.
              </p>
            </div>
          )}

          {routeId && loadingDetail && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
            </div>
          )}

          {routeId && detail && detail.orders.length === 0 && !loadingDetail && (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Nenhum pedido para empacotar nesta rota</p>
              <p className="text-sm mt-1">
                {deliveryMethodId !== "all" ? "Tente outro tipo de entrega." : "Todos os pedidos já podem ter sido processados."}
              </p>
            </div>
          )}

          {routeId && detail && detail.orders.length > 0 && (
            <div className="space-y-4">
              {detail.orders.map((order) => (
                <OrderPackagingCard key={order.orderId} order={order as any} onToggle={toggle} isPending={setPackagedMutation.isPending} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="direct">
          <p className="text-sm text-muted-foreground mb-4">
            Pedidos que precisam ser entregues mas ainda não estão em nenhuma rota — seja porque
            são retirada/entrega na mão (nunca usam rota), seja porque foram removidos manualmente
            de alguma rota (ex: cliente pediu para adiar a entrega).
          </p>

          {deliveryMethods.length > 1 && (
            <div className="mb-6 max-w-xs">
              <label className="text-sm font-medium text-foreground mb-1.5 block">Tipo de entrega</label>
              <Select value={directMethodId} onValueChange={setDirectMethodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo de entrega" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {deliveryMethods.map(dm => (
                    <SelectItem key={dm.id} value={String(dm.id)}>{dm.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {loadingDirect && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
            </div>
          )}

          {!loadingDirect && directOrders.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <HandHelping className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Nenhum pedido pendente aqui</p>
              <p className="text-sm mt-1">
                Todos os pedidos sem rota já foram empacotados e entregues.
              </p>
            </div>
          )}

          {!loadingDirect && directOrders.length > 0 && (
            <div className="space-y-4">
              {directOrders.map((order: any) => (
                <OrderPackagingCard key={order.orderId} order={order} onToggle={toggle} isPending={setPackagedMutation.isPending} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
