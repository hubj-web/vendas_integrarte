import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Boxes, Link as LinkIcon, ChevronDown, ChevronRight, Tag } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export default function Estoque() {
  const { data: estoque, isLoading } = trpc.estoque.list.useQuery();
  const [categoriasAbertas, setCategoriasAbertas] = useState<Set<string>>(new Set());

  const grupos = useMemo(() => {
    if (!estoque) return [];
    const map = new Map<string, { categoryName: string; itens: typeof estoque; quantidadeTotal: number; valorTotal: number }>();
    for (const item of estoque) {
      const key = item.categoryName ?? "Sem Categoria";
      if (!map.has(key)) map.set(key, { categoryName: key, itens: [], quantidadeTotal: 0, valorTotal: 0 });
      const grupo = map.get(key)!;
      grupo.itens.push(item);
      grupo.quantidadeTotal += item.quantidade;
      grupo.valorTotal += item.quantidade * parseFloat(item.custoMedioUnitario);
    }
    return Array.from(map.values()).sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  }, [estoque]);

  function toggleCategoria(nome: string) {
    setCategoriasAbertas(prev => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome);
      else next.add(nome);
      return next;
    });
  }

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
        <div className="space-y-3">
          {grupos.map((grupo) => {
            const aberta = categoriasAbertas.has(grupo.categoryName);
            return (
              <Card key={grupo.categoryName} className="overflow-hidden">
                <button
                  onClick={() => toggleCategoria(grupo.categoryName)}
                  className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {aberta ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <Tag className="w-4 h-4 text-primary shrink-0" />
                    <p className="font-semibold text-foreground">{grupo.categoryName}</p>
                    <Badge variant="outline" className="text-xs shrink-0">{grupo.itens.length} {grupo.itens.length === 1 ? "item" : "itens"}</Badge>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-primary">{fmt(grupo.valorTotal)}</p>
                    <p className="text-[10px] text-muted-foreground">{grupo.quantidadeTotal} unidades</p>
                  </div>
                </button>

                {aberta && (
                  <div className="border-t divide-y">
                    {grupo.itens.map((e, i) => (
                      <div key={i} className="p-4 flex items-center justify-between gap-3 bg-muted/10">
                        <div>
                          <p className="font-medium text-foreground text-sm">{e.productName}</p>
                          {e.flavorNames.length > 0 && (
                            <p className="text-xs text-muted-foreground">{e.flavorNames.join(", ")}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">Custo médio: {fmt(e.custoMedioUnitario)}/{e.unit}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-primary">{e.quantidade}</p>
                          <Badge variant="outline" className="text-xs">{e.unit}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
