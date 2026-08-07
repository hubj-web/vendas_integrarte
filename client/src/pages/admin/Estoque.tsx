import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Boxes, Link as LinkIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export default function Estoque() {
  const { data: estoque, isLoading } = trpc.estoque.list.useQuery();

  const valorTotalEstoque = estoque?.reduce((acc, e) => acc + e.quantidade * parseFloat(e.custoMedioUnitario), 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque Integrarte"
        description="Nível atual de cada produto — o que está disponível pra vender fora do período de vendas"
        actions={
          <Link href="/admin/config/pedidos-estoque">
            <Button variant="outline" className="gap-1.5">
              <LinkIcon className="w-4 h-4" /> Pedidos de Estoque
            </Button>
          </Link>
        }
      />

      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor total em estoque (custo)</p>
          <p className="text-2xl font-bold text-foreground">{fmt(valorTotalEstoque)}</p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : estoque?.length === 0 ? (
        <div className="text-center py-20 bg-card border border-dashed border-border rounded-xl">
          <Boxes className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-medium">Nenhum item em estoque no momento.</h3>
          <p className="text-muted-foreground">Crie um Pedido de Estoque e marque como "Recebido" pra dar entrada aqui.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {estoque?.map((e, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{e.productName}</p>
                  {e.flavorNames.length > 0 && (
                    <p className="text-xs text-muted-foreground">{e.flavorNames.join(", ")}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">Custo médio: {fmt(e.custoMedioUnitario)}/{e.unit}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold text-primary">{e.quantidade}</p>
                  <Badge variant="outline" className="text-xs">{e.unit}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
