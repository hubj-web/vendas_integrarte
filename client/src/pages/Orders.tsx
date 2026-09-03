import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Eye, Filter, Package, Trash2, MoreHorizontal, User, Pencil } from "lucide-react";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { PeriodFilterSelect } from "@/components/PeriodFilterSelect";
import { periodValueToRange } from "@/lib/periodFilter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

const statusOptions = [
  { value: "all", label: "Todos os status" },
  { value: "received", label: "Recebido" },
  { value: "production", label: "Em Produção" },
  { value: "in_route", label: "Em Rota" },
  { value: "packaged", label: "Empacotado" },
  { value: "delivered", label: "Entregue" },
  { value: "delivery_failed", label: "Entrega sem sucesso" },
  { value: "paid", label: "Pago" },
  { value: "cancelled", label: "Cancelado" },
];

const paymentOptions = [
  { value: "all", label: "Todos pagamentos" },
  { value: "pending", label: "Pendente" },
  { value: "paid", label: "Pago" },
  { value: "partial", label: "Parcial" },
];

const viewOptions = [
  { value: "all", label: "Todos" },
  { value: "periodo", label: "Período de Vendas" },
  { value: "loja_eventos", label: "Loja e Eventos" },
  { value: "aguardando_pagamento", label: "Aguardando Pagamento" },
  { value: "para_produzir", label: "Pra Produzir" },
  { value: "para_empacotar", label: "Pra Empacotar" },
  { value: "retiradas_hoje", label: "Retiradas de Hoje" },
  { value: "em_atraso", label: "Em Atraso" },
] as const;

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function Orders() {
  const { user } = useLocalAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [view, setView] = useState<(typeof viewOptions)[number]["value"]>("all");
  const [month, setMonth] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const utils = trpc.useUtils();

  const bulkUpdateStatus = trpc.orders.bulkUpdateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizados com sucesso!");
      setSelectedIds([]);
      utils.orders.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkUpdatePaymentStatus = trpc.orders.bulkUpdatePaymentStatus.useMutation({
    onSuccess: () => {
      toast.success("Pagamentos atualizados com sucesso!");
      setSelectedIds([]);
      utils.orders.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDelete = trpc.orders.bulkDelete.useMutation({
    onSuccess: () => {
      toast.success("Pedidos excluídos com sucesso!");
      setSelectedIds([]);
      utils.orders.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === orders.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(orders.map(o => o.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Tem certeza que deseja excluir ${selectedIds.length} pedidos?`)) {
      bulkDelete.mutate({ ids: selectedIds });
    }
  };

  // Calculate dateFrom/dateTo from month filter (incluindo suporte a período personalizado)
  const { dateFrom, dateTo } = periodValueToRange(month);

  const { data, isLoading } = trpc.orders.list.useQuery({
    page, pageSize: 25,
    search: search || undefined,
    status: status !== "all" ? status : undefined,
    paymentStatus: paymentStatus !== "all" ? paymentStatus : undefined,
    view: view !== "all" ? view : undefined,
    dateFrom,
    dateTo,
  });

  const orders = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  const fmt = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(v));

  return (
    <div>
      <PageHeader
        title="Pedidos"
        description={`${total} pedido${total !== 1 ? "s" : ""} encontrado${total !== 1 ? "s" : ""}`}
        actions={
          user?.role !== "delivery" ? (
            <Link href="/admin/pedidos/novo">
              <Button className="bg-primary text-primary-foreground gap-2"><Plus className="w-4 h-4" />Novo Pedido</Button>
            </Link>
          ) : undefined
        }
      />

      {/* Visões prontas — filtros comuns num clique só */}
      <div className="flex flex-wrap gap-2 mb-4">
        {viewOptions.map(v => (
          <button
            key={v.value}
            onClick={() => { setView(v.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              view === v.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Filters & Bulk Actions */}
      <div className="flex flex-col gap-4 mb-4">
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl animate-in fade-in slide-in-from-top-2">
            <span className="text-sm font-medium text-primary ml-2">
              {selectedIds.length} selecionado{selectedIds.length > 1 ? "s" : ""}
            </span>
            <div className="h-4 w-px bg-primary/20 mx-2" />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2 border-primary/20 text-primary hover:bg-primary/10">
                  <MoreHorizontal className="w-4 h-4" /> Ações em Massa
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Alterar Status</DropdownMenuLabel>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Status do Pedido</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {statusOptions.filter(o => o.value !== "all").map(o => (
                      <DropdownMenuItem key={o.value} onClick={() => bulkUpdateStatus.mutate({ ids: selectedIds, status: o.value as any })}>
                        {o.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Status do Pagamento</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {paymentOptions.filter(o => o.value !== "all").map(o => (
                      <DropdownMenuItem key={o.value} onClick={() => bulkUpdatePaymentStatus.mutate({ ids: selectedIds, paymentStatus: o.value as any })}>
                        {o.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleBulkDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" /> Excluir Pedidos
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])} className="text-muted-foreground text-xs">
              Cancelar
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 bg-input" />
        </div>
        <PeriodFilterSelect value={month} onChange={(v) => { setMonth(v); setPage(1); }} className="w-48 bg-input" />
        <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-44 bg-input"><SelectValue /></SelectTrigger>
          <SelectContent>{statusOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        {user?.role !== "delivery" && (
          <Select value={paymentStatus} onValueChange={v => { setPaymentStatus(v); setPage(1); }}>
            <SelectTrigger className="w-44 bg-input"><SelectValue /></SelectTrigger>
            <SelectContent>{paymentOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox checked={orders.length > 0 && selectedIds.length === orders.length} onCheckedChange={toggleSelectAll} />
              </TableHead>
              <TableHead className="text-muted-foreground">#</TableHead>
              <TableHead className="text-muted-foreground">Origem</TableHead>
              <TableHead className="text-muted-foreground">Cliente</TableHead>
              <TableHead className="text-muted-foreground">Vendedor</TableHead>
              <TableHead className="text-muted-foreground">Entrega</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Pagamento</TableHead>
              <TableHead className="text-muted-foreground">Total</TableHead>
              <TableHead className="text-muted-foreground">Data</TableHead>
              <TableHead className="text-muted-foreground">Produtos</TableHead>
              <TableHead className="text-right text-muted-foreground sticky right-0 bg-card">Ver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  {Array.from({ length: 11 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                  <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Nenhum pedido encontrado
                </TableCell>
              </TableRow>
            ) : (
              orders.map(o => (
                <TableRow key={o.id} className="border-border hover:bg-muted/20 group">
                  <TableCell>
                    <Checkbox checked={selectedIds.includes(o.id)} onCheckedChange={() => toggleSelect(o.id)} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm font-mono">#{o.id}</TableCell>
                  <TableCell>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {o.channel === "periodo" ? "Período" : o.eventName ? o.eventName : o.channel === "loja_publica" ? "Loja" : "Evento"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{o.customerName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{o.customerPhone}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{o.launcherName ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{o.deliveryMethodName ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                  <TableCell><StatusBadge status={o.paymentStatus} /></TableCell>
                  <TableCell className="font-semibold text-primary">{fmt(o.totalAmount)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(o.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                    <div className="flex items-center gap-1">
                      <Package className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span className="truncate" title={(o as any).productSummary}>
                        {(o as any).productSummary ?? "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right sticky right-0 bg-card group-hover:bg-muted/20">
                    <div className="flex items-center justify-end gap-1">

                      <Link href={`/admin/pedidos/${o.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" title="Ver Detalhes">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">Página {page} de {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
}
