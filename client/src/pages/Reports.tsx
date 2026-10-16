import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { TrendingUp, Package, Truck, DollarSign, Users, Calendar, Loader2, FileDown, CreditCard } from "lucide-react";
import { toast } from "sonner";

function downloadBase64File(base64: string, filename: string, mimeType: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#f59e0b", "#f87171", "#c084fc"];

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function StatCard({ title, value, sub, icon: Icon, color }: { title: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];

  const [dateFrom, setDateFrom] = useState(firstDay);
  const [dateTo, setDateTo] = useState(todayStr);
  const [applied, setApplied] = useState({ from: firstDay, to: todayStr });

  const { data: salesReport, isLoading: loadingSales } = trpc.reports.sales.useQuery({ dateFrom: applied.from, dateTo: applied.to });
  const { data: deliveryReport, isLoading: loadingDelivery } = trpc.reports.deliveries.useQuery({ dateFrom: applied.from, dateTo: applied.to });
  const { data: financialReport, isLoading: loadingFinancial, error: financialError, refetch: refetchFinancial } = trpc.reports.financial.useQuery({ dateFrom: applied.from, dateTo: applied.to });

  const [reconEventId, setReconEventId] = useState<string>("all");
  const [reconProductId, setReconProductId] = useState<string>("all");
  const { data: events = [] } = trpc.storeAdmin.events.list.useQuery();
  const { data: allProducts = [] } = trpc.catalog.products.list.useQuery();
  const { data: reconData, isLoading: loadingRecon } = trpc.reports.salesReconciliation.useQuery({
    dateFrom: applied.from, dateTo: applied.to,
    eventId: reconEventId === "all" ? undefined : reconEventId === "regular" ? "regular" : Number(reconEventId),
    productId: reconProductId === "all" ? undefined : Number(reconProductId),
  });

  const PAYMENT_METHOD_LABEL: Record<string, string> = { pix: "PIX", credit_card: "Cartão de Crédito", debit_card: "Cartão de Débito", cash: "Dinheiro" };

  const financialPdfMutation = trpc.reports.financialPdf.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename, data.mimeType);
      toast.success("PDF gerado!");
    },
    onError: (e) => toast.error(e.message),
  });


  function applyFilter() {
    setApplied({ from: dateFrom, to: dateTo });
  }

  return (
    <div>
      <PageHeader title="Relatórios" description="Análise de vendas, entregas e desempenho" />

      {/* Date filter */}
      <Card className="bg-card border-border mb-6">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-input h-8 text-sm w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-input h-8 text-sm w-36" />
            </div>
            <Button onClick={applyFilter} size="sm" className="bg-primary text-primary-foreground h-8 gap-1.5">
              <Calendar className="w-3.5 h-3.5" />Aplicar
            </Button>
            <div className="flex gap-2 ml-auto">
              {[
                { label: "Este mês", from: firstDay, to: todayStr },
                { label: "Últimos 7 dias", from: new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0], to: todayStr },
                { label: "Últimos 30 dias", from: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0], to: todayStr },
              ].map(preset => (
                <Button key={preset.label} variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(preset.from); setDateTo(preset.to); setApplied({ from: preset.from, to: preset.to }); }}>
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="sales">
        <TabsList className="bg-muted/30 mb-4">
          <TabsTrigger value="sales" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Vendas</TabsTrigger>
          <TabsTrigger value="delivery" className="gap-1.5"><Truck className="w-3.5 h-3.5" />Entregas</TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5"><DollarSign className="w-3.5 h-3.5" />Financeiro</TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-1.5"><CreditCard className="w-3.5 h-3.5" />Conciliação</TabsTrigger>

        </TabsList>

        {/* SALES */}
        <TabsContent value="sales">
          {loadingSales ? <ReportSkeleton /> : salesReport ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard title="Total Vendido" value={fmt(salesReport.totalRevenue)} icon={DollarSign} color="bg-primary/10 text-primary" />
                <StatCard title="Pedidos" value={String(salesReport.totalOrders)} icon={Package} color="bg-blue-500/10 text-blue-400" />
                <StatCard title="Ticket Médio" value={fmt(salesReport.avgTicket)} icon={TrendingUp} color="bg-emerald-500/10 text-emerald-400" />
                <StatCard title="Vendedores" value={String((salesReport.byLauncher?.length || 0))} icon={Users} color="bg-orange-500/10 text-orange-400" />
              </div>

              {(salesReport.byLauncher?.length || 0) > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Vendas por Vendedor</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={salesReport.byLauncher}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `R$${v}`} />
                        <Tooltip formatter={(v: number) => [fmt(v), "Vendas"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {(salesReport.topProducts?.length || 0) > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Produtos Mais Vendidos</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <Table>
                        <TableHeader><TableRow className="border-border hover:bg-transparent"><TableHead className="text-muted-foreground text-xs">Produto</TableHead><TableHead className="text-muted-foreground text-xs">Qtd.</TableHead><TableHead className="text-muted-foreground text-xs">Total</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {salesReport.topProducts.slice(0, 8).map((p: any, i: number) => (
                            <TableRow key={i} className="border-border hover:bg-muted/20">
                              <TableCell className="text-sm font-medium">{p.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{p.quantity}</TableCell>
                              <TableCell className="text-sm text-primary font-semibold">{fmt(p.revenue)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={(() => {
                            const top = salesReport.topProducts.slice(0, 6);
                            const rest = salesReport.topProducts.slice(6);
                            const restTotal = rest.reduce((acc: number, p: any) => acc + p.revenue, 0);
                            return restTotal > 0 ? [...top, { name: "Outros", revenue: restTotal }] : top;
                          })()} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                            {(() => {
                              const count = Math.min(salesReport.topProducts.length, 6) + (salesReport.topProducts.length > 6 ? 1 : 0);
                              return Array.from({ length: count }).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />);
                            })()}
                          </Pie>
                          <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </TabsContent>

        {/* DELIVERY */}
        <TabsContent value="delivery">
          {loadingDelivery ? <ReportSkeleton /> : deliveryReport ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard title="Total Pedidos" value={String(deliveryReport.totalOrders)} icon={Truck} color="bg-primary/10 text-primary" />
                <StatCard title="Entregues" value={String(deliveryReport.deliveredCount)} icon={Package} color="bg-emerald-500/10 text-emerald-400" />
                <StatCard title="Entregadores" value={String((deliveryReport.byDeliverer?.length || 0))} icon={Truck} color="bg-blue-500/10 text-blue-400" />
                <StatCard title="Taxa Entrega" value={`${deliveryReport.deliveryRate.toFixed(1)}%`} icon={TrendingUp} color="bg-orange-500/10 text-orange-400" />
              </div>

              {(deliveryReport.byDeliverer?.length || 0) > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Desempenho por Entregador</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow className="border-border hover:bg-transparent"><TableHead className="text-muted-foreground text-xs">Entregador</TableHead><TableHead className="text-muted-foreground text-xs">Entregas</TableHead><TableHead className="text-muted-foreground text-xs">Rotas</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {deliveryReport.byDeliverer.map((d: any, i: number) => (
                          <TableRow key={i} className="border-border hover:bg-muted/20">
                            <TableCell className="text-sm font-medium">{d.name}</TableCell>
                            <TableCell className="text-sm">{d.count}</TableCell>
                            <TableCell className="text-sm">—</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </TabsContent>

        {/* FINANCIAL */}
        <TabsContent value="financial">
          {loadingFinancial ? <ReportSkeleton /> : financialError ? (
            <div className="text-center py-16">
              <p className="text-sm text-red-500 font-medium mb-1">Não foi possível carregar o relatório financeiro.</p>
              <p className="text-xs text-muted-foreground mb-4">{financialError.message}</p>
              <Button size="sm" variant="outline" onClick={() => refetchFinancial()}>Tentar novamente</Button>
            </div>
          ) : financialReport ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <StatCard title="Total Recebido" value={fmt(financialReport.totalReceived)} icon={DollarSign} color="bg-primary/10 text-primary" />
                <StatCard title="PIX" value={fmt(financialReport.pixReceived)} icon={TrendingUp} color="bg-emerald-500/10 text-emerald-400" />
                <StatCard title="Dinheiro" value={fmt(financialReport.cashReceived)} icon={DollarSign} color="bg-teal-500/10 text-teal-400" />
                <StatCard title="Pendente" value={fmt(financialReport.totalPending)} icon={Package} color="bg-orange-500/10 text-orange-400" sub={`${(financialReport.pendingOrders?.length || 0)} pedidos`} />
                <StatCard title="Custo" value={fmt(financialReport.totalCost)} icon={Package} color="bg-red-500/10 text-red-400" sub="Do período vendido" />
                <StatCard title="Compras de Estoque" value={fmt(financialReport.custoComprasEstoque)} icon={Truck} color="bg-orange-500/10 text-orange-400" sub="Pedidos recebidos no período" />
                <StatCard
                  title="Lucro"
                  value={fmt(financialReport.profit)}
                  icon={TrendingUp}
                  color={financialReport.profit >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}
                  sub={financialReport.totalRevenue > 0 ? `Margem: ${((financialReport.profit / financialReport.totalRevenue) * 100).toFixed(0)}%` : undefined}
                />
              </div>

              <Card className="bg-card border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Formas de Pagamento</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
                      <div className="space-y-3">
                        {[{ method: "pix", label: "PIX", amount: financialReport.pixReceived }, { method: "cash", label: "Dinheiro", amount: financialReport.cashReceived }].map((m, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                              <span className="text-sm">{m.label}</span>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold">{fmt(m.amount)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={[{ name: "PIX", value: financialReport.pixReceived }, { name: "Dinheiro", value: financialReport.cashReceived }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65}>
                            {[0, 1].map(i => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

              {financialReport.profitByCategory && financialReport.profitByCategory.length > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Lucro por Categoria</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="text-muted-foreground text-xs">Categoria</TableHead>
                          <TableHead className="text-muted-foreground text-xs">Faturamento</TableHead>
                          <TableHead className="text-muted-foreground text-xs">Custo</TableHead>
                          <TableHead className="text-muted-foreground text-xs">Lucro</TableHead>
                          <TableHead className="text-muted-foreground text-xs">Margem</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {financialReport.profitByCategory.map((c: any, i: number) => (
                          <TableRow key={i} className="border-border hover:bg-muted/20">
                            <TableCell className="text-sm font-medium">{c.category}</TableCell>
                            <TableCell className="text-sm">{fmt(c.revenue)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{fmt(c.cost)}</TableCell>
                            <TableCell className={`text-sm font-semibold ${c.profit >= 0 ? "text-emerald-500" : "text-red-500"}`}>{fmt(c.profit)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {c.revenue > 0 ? `${((c.profit / c.revenue) * 100).toFixed(0)}%` : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end">
                <Button
                  variant="outline" size="sm" className="gap-2"
                  disabled={financialPdfMutation.isPending}
                  onClick={() => financialPdfMutation.mutate({ dateFrom: applied.from, dateTo: applied.to })}
                >
                  {financialPdfMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                  Exportar Relatório Financeiro em PDF
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>

        {/* CONCILIAÇÃO */}
        <TabsContent value="reconciliation">
          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={reconEventId} onValueChange={setReconEventId}>
              <SelectTrigger className="w-56 bg-input"><SelectValue placeholder="Filtrar por evento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos (Venda Regular + Eventos)</SelectItem>
                <SelectItem value="regular">Só Venda Regular</SelectItem>
                {events.map((ev: any) => <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={reconProductId} onValueChange={setReconProductId}>
              <SelectTrigger className="w-56 bg-input"><SelectValue placeholder="Filtrar por produto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os produtos</SelectItem>
                {allProducts.filter((p: any) => p.active).map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadingRecon ? <ReportSkeleton /> : reconData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {reconData.byPaymentMethod.map(pm => (
                  <Card key={pm.paymentMethod} className="bg-card border-border">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{PAYMENT_METHOD_LABEL[pm.paymentMethod] ?? pm.paymentMethod}</p>
                      <p className="text-xl font-bold text-emerald-600 mt-1">{fmt(pm.paidTotal)}</p>
                      <p className="text-xs text-muted-foreground">{pm.paidCount} pedido{pm.paidCount !== 1 ? "s" : ""} pago{pm.paidCount !== 1 ? "s" : ""}</p>
                      {pm.pendingCount > 0 && (
                        <p className="text-xs text-amber-600 mt-1">+ {fmt(pm.pendingTotal)} pendente ({pm.pendingCount})</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {reconData.byPaymentMethod.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-full py-4">Nenhum pedido nesse filtro.</p>
                )}
              </div>

              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-sm">Pedidos no período ({reconData.orders.length})</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Produtos</TableHead>
                        <TableHead>Pagamento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reconData.orders.map((o: any) => (
                        <TableRow key={o.id}>
                          <TableCell className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                          <TableCell className="text-sm">{o.customerName ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{o.eventName ?? "Venda Regular"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                            {o.items.map((it: any, i: number) => <div key={i}>{it.quantity} {it.productName ?? "Produto removido"}</div>)}
                          </TableCell>
                          <TableCell className="text-xs">{PAYMENT_METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}</TableCell>
                          <TableCell>
                            <Badge variant={o.paymentStatus === "paid" ? "default" : "secondary"}>
                              {o.paymentStatus === "paid" ? "Pago" : o.paymentStatus === "rejected" ? "Recusado" : "Pendente"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">{fmt(Number(o.totalAmount))}</TableCell>
                        </TableRow>
                      ))}
                      {reconData.orders.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum pedido nesse filtro.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </TabsContent>

        {/* PERFORMANCE - using byLauncher from sales */}
        <TabsContent value="performance">
          {loadingSales ? <ReportSkeleton /> : salesReport ? (
            <div className="space-y-4">
              {(salesReport.byLauncher?.length || 0) > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Pedidos por Vendedor</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow className="border-border hover:bg-transparent"><TableHead className="text-muted-foreground text-xs">Vendedor</TableHead><TableHead className="text-muted-foreground text-xs">Pedidos</TableHead><TableHead className="text-muted-foreground text-xs">Total</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {salesReport.byLauncher.map((l: any, i: number) => (
                          <TableRow key={i} className="border-border hover:bg-muted/20">
                            <TableCell className="text-sm font-medium">{l.name}</TableCell>
                            <TableCell className="text-sm">{l.count}</TableCell>
                            <TableCell className="text-sm text-primary font-semibold">{fmt(l.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
