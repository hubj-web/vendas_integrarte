import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Package, Truck, Download, Printer, Filter } from "lucide-react";
import { format, subDays } from "date-fns";

export default function ProductionReport() {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("all");

  const { data: suppliers = [] } = trpc.suppliers.list.useQuery();
  const { data: production = [], isLoading } = trpc.reports.production.useQuery({
    dateFrom: startDate,
    dateTo: endDate,
  });

  // Consolidate and filter production data for display
  const productionData = useMemo(() => {
    if (!production || !Array.isArray(production)) return [];

    return production
      .map(s => {
        const supplierInfo = suppliers.find(sup => sup.id === s.supplierId);
        return {
          ...s,
          supplierName: s.supplierId === 0 ? "Sem Fornecedor" : (supplierInfo?.name || "Desconhecido")
        };
      })
      .filter(s => selectedSupplierId === "all" || String(s.supplierId) === selectedSupplierId);
  }, [production, suppliers, selectedSupplierId]);

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const formatUnit = (unit: string, quantity: number) => {
    if (quantity < 2) return unit;
    const u = unit.toLowerCase();
    if (u === "pacote") return "pacotes";
    if (u === "unidade") return "unidades";
    if (u === "un") return "unidades";
    return unit;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Relatório de Produção" 
        description="Consolidado de quantidades por fornecedor para pedidos"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" /> Imprimir
            </Button>
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" /> Exportar
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <Card className="bg-card border-border print:hidden">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label>Data Início</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-input" />
            </div>
            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-input" />
            </div>
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger className="bg-input"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os fornecedores</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  <SelectItem value="0">Sem Fornecedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="secondary" className="gap-2">
              <Filter className="w-4 h-4" /> Filtrar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Content */}
      <div className="space-y-8 print:space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : productionData.length === 0 ? (
          <div className="text-center py-20 bg-card border border-dashed border-border rounded-xl">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-medium">Nenhum pedido no período</h3>
            <p className="text-muted-foreground">Tente selecionar outro intervalo de datas.</p>
          </div>
        ) : (
          productionData.map(supplier => (
            <Card key={supplier.supplierId} className="bg-card border-border overflow-hidden print:shadow-none print:border-gray-200">
              <CardHeader className="bg-muted/30 border-b border-border py-3 flex flex-col gap-4">
                <div className="flex flex-row items-center justify-between w-full">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Truck className="w-5 h-5 text-primary" />
                    {supplier.supplierName}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="print:hidden">
                      {Object.keys(supplier.items).length} produtos
                    </Badge>
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                      Pagar: {fmt(supplier.totalCost)}
                    </Badge>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-background/50 p-2 rounded-lg border border-border/50">
                    <div className="text-[10px] text-muted-foreground uppercase">Custo Total</div>
                    <div className="text-sm font-semibold text-orange-400">{fmt(supplier.totalCost)}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent bg-muted/10">
                      <TableHead className="w-[25%]">Produto</TableHead>
                      <TableHead className="w-[35%]">Sabores</TableHead>
                      <TableHead className="w-[10%]">Detalhes</TableHead>
                      <TableHead className="text-center w-[10%]">Quantidade</TableHead>
                      <TableHead className="text-right pr-6 w-[20%]">Financeiro (Custo)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(supplier.items).map(([id, item]: [string, any]) => (
                      <TableRow key={id} className="border-border hover:bg-muted/5">
                        <TableCell className="font-medium align-top py-4">
                          {item.name}
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          {item.combinations && Object.keys(item.combinations).length > 0 ? (
                            <div className="space-y-1">
                              {Object.keys(item.combinations).map(comb => (
                                <div key={comb} className="text-[10px] text-muted-foreground border-b border-border/20 pb-1 last:border-0">
                                  {comb}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">Sem sabores</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          {item.combinations && Object.keys(item.combinations).length > 0 ? (
                            <div className="space-y-1">
                              {Object.entries(item.combinations).map(([comb, qty]: [string, any]) => (
                                <div key={comb} className="text-[10px] font-medium border-b border-border/20 pb-1 last:border-0">
                                  {qty}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[10px] font-medium">{item.quantity}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center align-top py-4">
                          <span className="text-base font-bold text-primary">
                            {item.quantity}
                          </span>
                          <div className="text-[10px] text-muted-foreground">
                            {formatUnit(item.unit, item.quantity)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6 align-top py-4">
                          <div className="text-[10px] text-muted-foreground">
                            Unitário: <span className="text-primary/80">{fmt(item.cost / item.quantity)}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Custo Total: <span className="text-orange-400/80">{fmt(item.cost)}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="hidden print:block text-[10px] text-gray-400 text-center mt-8">
        Relatório gerado em {format(new Date(), "dd/MM/yyyy HH:mm")} - Sistema Integrarte
      </div>
    </div>
  );
}
