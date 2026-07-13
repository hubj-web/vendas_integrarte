import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Info, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function Jellies() {
  const utils = trpc.useUtils();
  const { data: flavors = [] } = trpc.catalog.jellyFlavors.list.useQuery();

  const updateMutation = trpc.catalog.jellyFlavors.update.useMutation({
    onSuccess: () => { utils.catalog.jellyFlavors.list.invalidate(); toast.success("Geleia atualizada!"); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ price: "", cost: "", active: true });

  function openEdit(f: any) {
    setEditing(f);
    setForm({ price: f.price, cost: f.cost ?? "0.00", active: f.active });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    updateMutation.mutate({ id: editing.id, price: form.price, cost: form.cost, active: form.active });
  }

  const fmt = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(v));

  return (
    <div>
      <PageHeader
        title="Geleias (Legado)"
        description="Dados de pedidos antigos — não afeta vendas novas"
      />

      <Alert className="mb-4 border-amber-500/30 bg-amber-500/10">
        <Info className="w-4 h-4 text-amber-400" />
        <AlertDescription className="text-amber-200">
          Geleias hoje são vendidas como produtos normais, cadastrados na página de <strong>Produtos</strong>
          (categoria "Geleias") — é lá que o preço e o custo precisam estar corretos para novas vendas.
          Esta página só existe para consultar/corrigir os dados de <strong>pedidos antigos</strong>, feitos antes
          dessa unificação, e que ainda aparecem nos relatórios financeiros com base nesses valores.
        </AlertDescription>
      </Alert>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Sabor</TableHead>
              <TableHead className="text-muted-foreground">Descrição</TableHead>
              <TableHead className="text-muted-foreground">Preço</TableHead>
              <TableHead className="text-muted-foreground">Custo</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flavors.map(f => (
              <TableRow key={f.id} className="border-border hover:bg-muted/20">
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{f.description ?? "—"}</TableCell>
                <TableCell className="text-primary font-semibold">{fmt(f.price)}</TableCell>
                <TableCell className="text-muted-foreground">{fmt(f.cost ?? "0")}</TableCell>
                <TableCell><Badge className={f.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}>{f.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => openEdit(f)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Geleia - {editing?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Preço</Label>
              <Input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className="bg-input" />
            </div>
            <div className="space-y-2">
              <Label>Custo</Label>
              <Input type="number" step="0.01" min="0" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} className="bg-input" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
              <Label>Ativo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary text-primary-foreground" disabled={updateMutation.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
