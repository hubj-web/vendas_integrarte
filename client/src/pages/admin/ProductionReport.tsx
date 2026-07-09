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
              <CardHeader className="bg-muted/30 border-b border-border py-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Truck className="w-5 h-5 text-primary" />
                  {supplier.supplierName}
                </CardTitle>
                <Badge variant="outline" className="print:hidden">
                  {Object.keys(supplier.items).length} produtos
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent bg-muted/10">
                      <TableHead className="w-[40%]">Produto</TableHead>
                      <TableHead>Sabores / Detalhes</TableHead>
                      <TableHead className="text-right w-[150px]">Quantidade Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(supplier.items).map(([id, item]: [string, any]) => (
                      <TableRow key={id} className="border-border hover:bg-muted/5">
                        <TableCell className="font-medium align-top py-4">
                          {item.name}
                        </TableCell>
                        <TableCell className="py-4">
                          {Object.keys(item.flavors).length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                              {Object.entries(item.flavors).map(([flavor, qty]: [string, any]) => (
                                <div key={flavor} className="flex justify-between text-xs border-b border-border/30 pb-1">
                                  <span className="text-muted-foreground">{flavor}</span>
                                  <span className="font-semibold">{qty} {item.unit}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Sem variação de sabores</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right align-top py-4">
                          <span className="text-lg font-bold text-primary">
                            {item.quantity}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            {item.unit}
                          </span>
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
