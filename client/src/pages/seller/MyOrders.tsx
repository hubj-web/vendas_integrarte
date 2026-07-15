import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, ShoppingBag, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export default function MyOrders() {
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const { data, isLoading } = trpc.seller.myOrders.useQuery(
    { status, page, pageSize: PAGE_SIZE }
  );

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Meus Pedidos</h2>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-44 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="production">Em produção</SelectItem>
            <SelectItem value="in_route">Em rota</SelectItem>
            <SelectItem value="delivered">Entregue</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : data?.orders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.orders.map((order) => (
            <Card key={order.id} className="bg-card border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground font-mono">#{order.id}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="font-medium text-foreground truncate">{order.customerName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {order.createdAt
                        ? format(new Date(order.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                        : "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-foreground">{fmt(order.totalAmount)}</p>
                    <div className="flex items-center gap-1.5 mt-1 justify-end">
                      {order.status === "production" && (
                        <Link href={`/vendedor/pedido/${order.id}/editar`}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary">
                            <Pencil className="w-3.5 h-3.5" />
                            Editar
                          </Button>
                        </Link>
                      )}
                      <Link href={`/vendedor/pedido/${order.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary">
                          <Eye className="w-3.5 h-3.5" />
                          Ver
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
