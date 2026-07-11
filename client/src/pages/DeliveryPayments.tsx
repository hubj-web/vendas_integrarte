import { useState, useRef } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Truck, CreditCard, Upload, Image, AlertTriangle, Loader2, Eye } from "lucide-react";
import { useLocalAuth } from "@/hooks/useLocalAuth";

export default function DeliveryPayments() {
  const { user } = useLocalAuth();
  const utils = trpc.useUtils();

  const [deliveryMethodFilter, setDeliveryMethodFilter] = useState<string>("all");
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"route" | "name" | "total_desc" | "total_asc" | "recent">("route");

  const { data: deliveryMethods = [] } = trpc.catalog.deliveryMethods.list.useQuery();
  const { data: routesList = [] } = trpc.delivery.routes.list.useQuery({});
  // Só faz sentido escolher rotas que ainda têm entregas em andamento
  const activeRoutes = routesList.filter(r => r.status === "planned" || r.status === "in_progress");

  // Orders in_route/packaged = pending delivery; delivered + payment pending = pending payment
  const { data: allOrders = [], isLoading: loadingDel } = trpc.orders.list.useQuery({
    pageSize: 500,
    statusIn: ["in_route", "packaged"],
    deliveryMethodId: deliveryMethodFilter !== "all" ? Number(deliveryMethodFilter) : undefined,
    routeId: routeFilter !== "all" ? Number(routeFilter) : undefined,
  });
  const pendingDeliveries = (() => {
    const list = (allOrders as any).data ?? allOrders;
    const sorted = [...list];
    switch (sortBy) {
      case "name":
        sorted.sort((a: any, b: any) => (a.customerName ?? "").localeCompare(b.customerName ?? ""));
        break;
      case "total_desc":
        sorted.sort((a: any, b: any) => parseFloat(b.totalAmount) - parseFloat(a.totalAmount));
        break;
      case "total_asc":
        sorted.sort((a: any, b: any) => parseFloat(a.totalAmount) - parseFloat(b.totalAmount));
        break;
      case "recent":
        sorted.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "route":
      default:
        if (routeFilter !== "all") {
          sorted.sort((a: any, b: any) => (a.routePosition ?? 0) - (b.routePosition ?? 0));
        }
        break;
    }
    return sorted;
  })();
  const { data: pendingPayments = [], isLoading: loadingPay } = trpc.orders.pendingPayments.useQuery();

  const registerDeliveryMutation = trpc.delivery.deliveryRecords.register.useMutation({
    onSuccess: () => { utils.orders.list.invalidate({}); utils.orders.pendingPayments.invalidate(); toast.success("Entrega registrada!"); setDeliveryOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const registerPaymentMutation = trpc.delivery.paymentRecords.register.useMutation({
    onSuccess: () => { utils.orders.pendingPayments.invalidate(); utils.orders.list.invalidate({}); toast.success("Pagamento registrado!"); setPaymentOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [deliveryForm, setDeliveryForm] = useState({ deliveryUserId: "", notes: "" });
  const [paymentForm, setPaymentForm] = useState({ method: "pix", amount: "", notes: "" });
  const [deliveryPhoto, setDeliveryPhoto] = useState<File | null>(null);
  const [paymentPhoto, setPaymentPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const deliveryPhotoRef = useRef<HTMLInputElement>(null);
  const paymentPhotoRef = useRef<HTMLInputElement>(null);

  const { data: deliverers = [] } = trpc.users.list.useQuery({ search: undefined });
  const deliveryUsers = deliverers.filter(u => u.role === "delivery");

  const fmt = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(v));

  async function uploadPhoto(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) throw new Error("Falha no upload da foto.");
    const data = await res.json();
    return data.url;
  }

  async function submitDelivery() {
    if (!selectedOrder) return;
    setUploading(true);
    try {
      let proofImageBase64: string | undefined;
      let proofImageMime: string | undefined;
      if (deliveryPhoto) {
        const buf = await deliveryPhoto.arrayBuffer();
        proofImageBase64 = btoa(Array.from(new Uint8Array(buf)).map(b => String.fromCharCode(b)).join(""));
        proofImageMime = deliveryPhoto.type;
      }
      registerDeliveryMutation.mutate({
        orderId: selectedOrder.id,
        notes: deliveryForm.notes || undefined,
        proofImageBase64,
        proofImageMime,
      });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function submitPayment() {
    if (!selectedOrder) return;
    if (!paymentForm.amount) return toast.error("Informe o valor recebido.");
    setUploading(true);
    try {
      let proofImageBase64: string | undefined;
      let proofImageMime: string | undefined;
      if (paymentPhoto) {
        const buf = await paymentPhoto.arrayBuffer();
        proofImageBase64 = btoa(Array.from(new Uint8Array(buf)).map(b => String.fromCharCode(b)).join(""));
        proofImageMime = paymentPhoto.type;
      }
      registerPaymentMutation.mutate({
        orderId: selectedOrder.id,
        paymentMethod: paymentForm.method as "cash" | "pix",
        amount: paymentForm.amount,
        notes: paymentForm.notes || undefined,
        proofImageBase64,
        proofImageMime,
      });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <PageHeader title="Entregas e Pagamentos" description="Registre entregas e confirme pagamentos" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 max-w-2xl">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Tipo de entrega</Label>
          <Select value={deliveryMethodFilter} onValueChange={setDeliveryMethodFilter}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Todos os tipos" />
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
          <Label className="text-xs text-muted-foreground mb-1 block">Rota</Label>
          <Select value={routeFilter} onValueChange={setRouteFilter}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Todas as rotas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as rotas</SelectItem>
              {activeRoutes.map(r => (
                <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Ordenar por</Label>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="route">Ordem da rota (padrão)</SelectItem>
              <SelectItem value="name">Nome do cliente</SelectItem>
              <SelectItem value="total_desc">Maior valor</SelectItem>
              <SelectItem value="total_asc">Menor valor</SelectItem>
              <SelectItem value="recent">Mais recentes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="deliveries">
        <TabsList className="bg-muted/30 mb-4">
          <TabsTrigger value="deliveries" className="gap-2">
            <Truck className="w-4 h-4" />Entregas Pendentes
            {pendingDeliveries.length > 0 && <Badge className="bg-primary/20 text-primary border-primary/20 text-xs ml-1">{pendingDeliveries.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <CreditCard className="w-4 h-4" />Pagamentos Pendentes
            {pendingPayments.length > 0 && <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/20 text-xs ml-1">{pendingPayments.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Deliveries */}
        <TabsContent value="deliveries">
          {loadingDel ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : pendingDeliveries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Nenhuma entrega pendente.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">#</TableHead>
                    {routeFilter !== "all" && <TableHead className="text-muted-foreground">Ordem</TableHead>}
                    <TableHead className="text-muted-foreground">Cliente</TableHead>
                    <TableHead className="text-muted-foreground">Produtos</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Total</TableHead>
                    <TableHead className="text-right text-muted-foreground">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(pendingDeliveries as any[]).map((o: any) => {
                    const addr = o.deliveryAddress || [o.customerStreet, o.customerNumber, o.customerNeighborhood].filter(Boolean).join(", ");
                    const productList: string[] = o.productList ?? [];
                    return (
                      <TableRow key={o.id} className="border-border hover:bg-muted/20 align-top">
                        <TableCell className="font-mono text-sm text-muted-foreground">#{o.id}</TableCell>
                        {routeFilter !== "all" && (
                          <TableCell className="text-sm font-semibold text-primary">{o.routePosition ?? "—"}</TableCell>
                        )}
                        <TableCell className="min-w-[200px]">
                          <p className="font-medium text-sm">{o.customerName}</p>
                          <p className="text-xs text-muted-foreground">{o.customerPhone}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{addr || "—"}</p>
                        </TableCell>
                        <TableCell className="min-w-[220px] max-w-[320px]">
                          {productList.length > 0 ? (
                            <ul className="text-xs text-foreground space-y-0.5">
                              {productList.map((p, i) => <li key={i}>{p}</li>)}
                            </ul>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell><StatusBadge status={o.status} /></TableCell>
                        <TableCell className="font-semibold text-primary">{fmt(o.totalAmount)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/admin/pedidos/${o.id}`}>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver Detalhes">
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
                            <Button size="sm" className="bg-primary text-primary-foreground text-xs h-7" onClick={() => { setSelectedOrder(o); setDeliveryForm({ deliveryUserId: "", notes: "" }); setDeliveryPhoto(null); setDeliveryOpen(true); }}>
                              Registrar Entrega
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments">
          {loadingPay ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : pendingPayments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Nenhum pagamento pendente.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">#</TableHead>
                    <TableHead className="text-muted-foreground">Cliente</TableHead>
                    <TableHead className="text-muted-foreground">Produtos</TableHead>
                    <TableHead className="text-muted-foreground">Pagamento</TableHead>
                    <TableHead className="text-muted-foreground">Status Pag.</TableHead>
                    <TableHead className="text-muted-foreground">Total</TableHead>
                    <TableHead className="text-muted-foreground">Entregue em</TableHead>
                    <TableHead className="text-right text-muted-foreground">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(pendingPayments as any[]).map((o: any) => {
                    const daysAgo = o.deliveredAt ? Math.floor((Date.now() - new Date(o.deliveredAt).getTime()) / 86400000) : null;
                    const addr = o.deliveryAddress || [o.customerStreet, o.customerNumber, o.customerNeighborhood].filter(Boolean).join(", ");
                    const productList: string[] = o.productList ?? [];
                    return (
                      <TableRow key={o.id} className="border-border hover:bg-muted/20 align-top">
                        <TableCell className="font-mono text-sm text-muted-foreground">#{o.id}</TableCell>
                        <TableCell className="min-w-[200px]">
                          <p className="font-medium text-sm">{o.customerName}</p>
                          <p className="text-xs text-muted-foreground">{o.customerPhone}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{addr || "—"}</p>
                        </TableCell>
                        <TableCell className="min-w-[220px] max-w-[320px]">
                          {productList.length > 0 ? (
                            <ul className="text-xs text-foreground space-y-0.5">
                              {productList.map((p, i) => <li key={i}>{p}</li>)}
                            </ul>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{o.paymentMethod === "pix" ? "PIX" : "Dinheiro"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={o.paymentStatus} />
                            {daysAgo !== null && daysAgo >= 3 && (
                              <span title={`Entregue há ${daysAgo} dias`}><AlertTriangle className="w-3.5 h-3.5 text-orange-400" /></span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold text-primary">{fmt(o.totalAmount)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{o.deliveredAt ? new Date(o.deliveredAt).toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/admin/pedidos/${o.id}`}>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver Detalhes">
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7" onClick={() => { setSelectedOrder(o); setPaymentForm({ method: o.paymentMethod ?? "pix", amount: o.totalAmount, notes: "" }); setPaymentPhoto(null); setPaymentOpen(true); }}>
                              Confirmar Pagamento
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delivery dialog */}
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>Registrar Entrega — Pedido #{selectedOrder?.id}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-muted/20 text-sm">
              <p className="font-medium">{selectedOrder?.customerName}</p>
              <p className="text-muted-foreground">{selectedOrder?.customerPhone}</p>
            </div>
            {user?.role !== "delivery" && (
              <div className="space-y-2">
                <Label>Entregador</Label>
                <Select value={deliveryForm.deliveryUserId} onValueChange={v => setDeliveryForm(f => ({ ...f, deliveryUserId: v }))}>
                  <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {deliveryUsers.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={deliveryForm.notes} onChange={e => setDeliveryForm(f => ({ ...f, notes: e.target.value }))} className="bg-input resize-none" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Foto do Comprovante (opcional)</Label>
              <input ref={deliveryPhotoRef} type="file" accept="image/*" className="hidden" onChange={e => setDeliveryPhoto(e.target.files?.[0] ?? null)} />
              <Button type="button" variant="outline" className="w-full gap-2 border-dashed" onClick={() => deliveryPhotoRef.current?.click()}>
                {deliveryPhoto ? <><Image className="w-4 h-4 text-primary" />{deliveryPhoto.name}</> : <><Upload className="w-4 h-4" />Selecionar foto</>}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliveryOpen(false)}>Cancelar</Button>
            <Button onClick={submitDelivery} className="bg-primary text-primary-foreground" disabled={registerDeliveryMutation.isPending || uploading}>
              {(registerDeliveryMutation.isPending || uploading) ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>Confirmar Pagamento — Pedido #{selectedOrder?.id}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-muted/20 text-sm">
              <p className="font-medium">{selectedOrder?.customerName}</p>
              <p className="text-primary font-bold text-lg">{selectedOrder ? fmt(selectedOrder.totalAmount) : ""}</p>
            </div>
            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <div className="flex gap-2">
                {[{ key: "pix", label: "PIX" }, { key: "cash", label: "Dinheiro" }].map(opt => (
                  <button key={opt.key} onClick={() => setPaymentForm(f => ({ ...f, method: opt.key }))} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border ${paymentForm.method === opt.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 text-muted-foreground border-border hover:border-primary/30"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor Recebido *</Label>
              <Input type="number" step="0.01" min="0" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} className="bg-input" />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} className="bg-input resize-none" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Comprovante PIX (opcional)</Label>
              <input ref={paymentPhotoRef} type="file" accept="image/*" className="hidden" onChange={e => setPaymentPhoto(e.target.files?.[0] ?? null)} />
              <Button type="button" variant="outline" className="w-full gap-2 border-dashed" onClick={() => paymentPhotoRef.current?.click()}>
                {paymentPhoto ? <><Image className="w-4 h-4 text-primary" />{paymentPhoto.name}</> : <><Upload className="w-4 h-4" />Selecionar comprovante</>}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancelar</Button>
            <Button onClick={submitPayment} className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={registerPaymentMutation.isPending || uploading}>
              {(registerPaymentMutation.isPending || uploading) ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
