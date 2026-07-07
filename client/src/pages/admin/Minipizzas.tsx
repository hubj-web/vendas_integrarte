import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Check, X } from "lucide-react";

export default function Minipizzas() {
  const { data: types = [] } = trpc.catalog.minipizzaTypes.list.useQuery();
  const { data: flavors = [] } = trpc.catalog.minipizzaFlavors.list.useQuery();
  const { data: matrix = [] } = trpc.catalog.minipizzaFlavors.getMatrix.useQuery();

  function isCompatible(typeId: number, flavorId: number) {
    return matrix.some(m => m.minipizzaTypeId === typeId && m.minipizzaFlavorId === flavorId && m.active);
  }

  const fmt = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(v));

  return (
    <div>
      <PageHeader title="Minipizzas (Legado)" description="Visualização dos dados de minipizzas do sistema antigo" />

      <Alert className="mb-4 border-amber-500/30 bg-amber-500/10">
        <Info className="w-4 h-4 text-amber-400" />
        <AlertDescription className="text-amber-200">
          Esta página é somente leitura. As minipizzas agora são gerenciadas como produtos com sabores na categoria "MiniPizzas" na página de <strong>Produtos</strong>.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="types">
        <TabsList className="bg-muted/30 mb-4">
          <TabsTrigger value="types">Tipos</TabsTrigger>
          <TabsTrigger value="flavors">Sabores</TabsTrigger>
          <TabsTrigger value="matrix">Matriz de Compatibilidade</TabsTrigger>
        </TabsList>

        <TabsContent value="types">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Nome</TableHead>
                  <TableHead className="text-muted-foreground">Unidades</TableHead>
                  <TableHead className="text-muted-foreground">Preço</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map(t => (
                  <TableRow key={t.id} className="border-border hover:bg-muted/20">
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.units} un.</TableCell>
                    <TableCell className="text-primary font-semibold">{fmt(t.price)}</TableCell>
                    <TableCell><Badge className={t.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}>{t.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="flavors">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Sabor</TableHead>
                  <TableHead className="text-muted-foreground">Descrição</TableHead>
                  <TableHead className="text-muted-foreground">Preço Adicional</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flavors.map(f => (
                  <TableRow key={f.id} className="border-border hover:bg-muted/20">
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{f.description ?? "—"}</TableCell>
                    <TableCell>{f.additionalPrice && parseFloat(f.additionalPrice) > 0 ? <span className="text-primary font-semibold">+{fmt(f.additionalPrice)}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><Badge className={f.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}>{f.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="matrix">
          <p className="text-sm text-muted-foreground mb-4">Compatibilidade entre tipos e sabores (somente leitura).</p>
          <div className="rounded-xl border border-border bg-card overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground min-w-[160px]">Tipo \ Sabor</TableHead>
                  {flavors.filter(f => f.active).map(f => (
                    <TableHead key={f.id} className="text-muted-foreground text-center text-xs min-w-[100px]">{f.name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.filter(t => t.active).map(t => (
                  <TableRow key={t.id} className="border-border hover:bg-muted/10">
                    <TableCell className="font-medium text-sm">{t.name}</TableCell>
                    {flavors.filter(f => f.active).map(f => {
                      const compat = isCompatible(t.id, f.id);
                      return (
                        <TableCell key={f.id} className="text-center">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto ${compat ? "bg-emerald-500/20 text-emerald-400" : "bg-muted/30 text-muted-foreground"}`}>
                            {compat ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
