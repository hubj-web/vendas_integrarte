import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  ShoppingBag, CreditCard, Package, Truck,
  TrendingUp, AlertCircle, ArrowRight, Plus,
} from "lucide-react";

function StatCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useLocalAuth();
  const { data, isLoading } = trpc.reports.dashboard.useQuery();

  const role = user?.role;
  const greeting = role === "admin" ? "Administrador" : role === "launcher" ? "Vendedor" : "Entregador";

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div>
      <PageHeader
        title={`Olá, ${user?.name?.split(" ")[0] ?? greeting}!`}
        description="Visão geral do sistema hoje"
        actions={
          role !== "delivery" ? (
            <Link href="/admin/pedidos/novo">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                <Plus className="w-4 h-4" />
                Novo Pedido
              </Button>
            </Link>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Pedidos Hoje"
              value={data.todayOrdersCount}
              icon={ShoppingBag}
              color="bg-blue-500/15 text-blue-400"
            />
            <StatCard
              title="Faturamento Hoje"
              value={fmt(data.todayRevenue)}
              icon={TrendingUp}
              color="bg-primary/15 text-primary"
            />
            <StatCard
              title="Pagamentos Pendentes"
              value={data.pendingPaymentsCount}
              sub={fmt(data.pendingAmount)}
              icon={AlertCircle}
              color="bg-orange-500/15 text-orange-400"
            />
            <StatCard
              title="Em Produção"
              value={data.inProductionCount}
              sub={`${data.inRouteCount} em rota`}
              icon={Package}
              color="bg-emerald-500/15 text-emerald-400"
            />
          </div>

          {/* Recent orders */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold">Pedidos Recentes</CardTitle>
              <Link href="/admin/pedidos">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary gap-1 text-xs">
                  Ver todos <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {data.recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum pedido encontrado.</p>
              ) : (
                <div className="space-y-2">
                  {data.recentOrders.map(order => (
                    <Link key={order.id} href={`/admin/pedidos/${order.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <ShoppingBag className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{order.customerName ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              #{order.id} · {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={order.status} />
                          <span className="text-sm font-semibold text-foreground">
                            {fmt(parseFloat(order.totalAmount))}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Overdue payments alert */}
          {data.pendingPaymentsCount > 0 && role !== "delivery" && (
            <Card className="bg-orange-500/5 border-orange-500/20 mt-4">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {data.pendingPaymentsCount} pedido{data.pendingPaymentsCount > 1 ? "s" : ""} entregue{data.pendingPaymentsCount > 1 ? "s" : ""} aguardando pagamento
                    </p>
                    <p className="text-xs text-muted-foreground">Total pendente: {fmt(data.pendingAmount)}</p>
                  </div>
                  <Link href="/admin/entregas-pagamentos">
                    <Button variant="outline" size="sm" className="text-orange-400 border-orange-500/30 hover:bg-orange-500/10">
                      Ver
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
