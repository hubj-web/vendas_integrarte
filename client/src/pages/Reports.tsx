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
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { TrendingUp, Package, Truck, DollarSign, Users, Calendar } from "lucide-react";

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
  const { data: financialReport, isLoading: loadingFinancial } = trpc.reports.financial.useQuery({ dateFrom: applied.from, dateTo: applied.to });


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
                              <TableCell className="text-sm text-muted-foreground">{p.qty}</TableCell>
                              <TableCell className="text-sm text-primary font-semibold">{fmt(p.revenue)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={salesReport.topProducts.slice(0, 6)} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                            {salesReport.topProducts.slice(0, 6).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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
          {loadingFinancial ? <ReportSkeleton /> : financialReport ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <StatCard title="Total Recebido" value={fmt(financialReport.totalReceived)} icon={DollarSign} color="bg-primary/10 text-primary" />
                <StatCard title="PIX" value={fmt(financialReport.pixReceived)} icon={TrendingUp} color="bg-emerald-500/10 text-emerald-400" />
                <StatCard title="Pendente" value={fmt(financialReport.totalPending)} icon={Package} color="bg-orange-500/10 text-orange-400" sub={`${(financialReport.pendingOrders?.length || 0)} pedidos`} />
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
