import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Truck } from "lucide-react";
import { format } from "date-fns";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export default function PedidoEstoquePrint() {
  const [, params] = useRoute("/admin/config/pedidos-estoque/:id/imprimir");
  const pedidoId = Number(params?.id);
  const { data: pedido, isLoading } = trpc.pedidosEstoque.getById.useQuery({ id: pedidoId }, { enabled: !!pedidoId });

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  }

  if (!pedido) {
    return <div className="p-8 text-center text-muted-foreground">Pedido não encontrado.</div>;
  }

  const total = pedido.itens.reduce((acc, i) => acc + i.quantidade * parseFloat(i.custoUnitario), 0);

  return (
    <div className="max-w-3xl mx-auto p-6 print:p-0">
      <div className="flex justify-end mb-4 print:hidden">
        <Button onClick={() => window.print()} className="gap-2">
          <Printer className="w-4 h-4" /> Imprimir
        </Button>
      </div>

      <Card className="print:shadow-none print:border-gray-200">
        <CardHeader className="bg-muted/30 border-b py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Pedido de Estoque — {pedido.fornecedorNome}
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            {pedido.descricao || `Pedido #${pedido.id}`} — Criado em {format(new Date(pedido.createdAt), "dd/MM/yyyy")}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Produto</TableHead>
                <TableHead className="w-[25%]">Sabores</TableHead>
                <TableHead className="text-center w-[10%]">Quantidade</TableHead>
                <TableHead className="text-right w-[12%]">Custo Unit.</TableHead>
                <TableHead className="text-right pr-6 w-[13%]">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pedido.itens.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium py-4">{item.productName} <span className="text-xs text-muted-foreground">({item.unit})</span></TableCell>
                  <TableCell className="py-4 text-xs text-muted-foreground">{item.flavorNames.length > 0 ? item.flavorNames.join(", ") : "—"}</TableCell>
                  <TableCell className="text-center py-4 font-bold text-primary">{item.quantidade}</TableCell>
                  <TableCell className="text-right py-4">{fmt(item.custoUnitario)}</TableCell>
                  <TableCell className="text-right pr-6 py-4 font-semibold">{fmt(item.quantidade * parseFloat(item.custoUnitario))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end p-4 border-t bg-muted/10">
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase">Valor Total do Pedido</p>
              <p className="text-2xl font-bold text-primary">{fmt(total)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {pedido.observacoes && (
        <div className="mt-4 text-sm text-muted-foreground">
          <strong>Observações:</strong> {pedido.observacoes}
        </div>
      )}

      <div className="hidden print:block text-[10px] text-gray-400 text-center mt-8">
        Gerado em {format(new Date(), "dd/MM/yyyy HH:mm")} - Sistema Integrarte
      </div>
    </div>
  );
}
