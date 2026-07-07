import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

export default function Jellies() {
  const { data: flavors = [] } = trpc.catalog.jellyFlavors.list.useQuery();
  const fmt = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(v));

  return (
    <div>
      <PageHeader
        title="Geleias (Legado)"
        description="Visualização dos sabores de geleia cadastrados no sistema antigo"
      />

      <Alert className="mb-4 border-amber-500/30 bg-amber-500/10">
        <Info className="w-4 h-4 text-amber-400" />
        <AlertDescription className="text-amber-200">
          Esta página é somente leitura. As geleias agora são gerenciadas como produtos na categoria "Geleias" na página de <strong>Produtos</strong>.
        </AlertDescription>
      </Alert>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Sabor</TableHead>
              <TableHead className="text-muted-foreground">Descrição</TableHead>
              <TableHead className="text-muted-foreground">Preço</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flavors.map(f => (
              <TableRow key={f.id} className="border-border hover:bg-muted/20">
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{f.description ?? "—"}</TableCell>
                <TableCell className="text-primary font-semibold">{fmt(f.price)}</TableCell>
                <TableCell><Badge className={f.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}>{f.active ? "Ativo" : "Inativo"}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
