import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Info, Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function Minipizzas() {
  const utils = trpc.useUtils();
  const { data: types = [] } = trpc.catalog.minipizzaTypes.list.useQuery();
  const { data: flavors = [] } = trpc.catalog.minipizzaFlavors.list.useQuery();
  const { data: matrix = [] } = trpc.catalog.minipizzaFlavors.getMatrix.useQuery();
  const { data: suppliers = [] } = trpc.suppliers.list.useQuery();

  const updateMutation = trpc.catalog.minipizzaTypes.update.useMutation({
    onSuccess: () => { utils.catalog.minipizzaTypes.list.invalidate(); toast.success("Minipizza atualizada!"); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ price: "", cost: "", supplierId: "", active: true });

  function openEdit(t: any) {
    setEditing(t);
    setForm({
      price: t.price,
      cost: t.cost ?? "0.00",
      supplierId: t.supplierId ? String(t.supplierId) : "",
      active: t.active,
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;

    const supplierId = form.supplierId ? parseInt(form.supplierId) : null;

    updateMutation.mutate({
      id: editing.id,
      price: form.price,
      cost: form.cost,
      supplierId,
      active: form.active,
    });
  }

  function isCompatible(typeId: number, flavorId: number) {
    return matrix.some(m => m.minipizzaTypeId === typeId && m.minipizzaFlavorId === flavorId && m.active);
  }

  const fmt = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(v));

  return (
    <div>
      <PageHeader
        title="Minipizzas (Legado)"
        description="Dados de pedidos antigos — não afeta vendas novas"
        actions={null}
      />

      <Alert className="mb-4 border-amber-500/30 bg-amber-500/10">
        <Info className="w-4 h-4 text-amber-400" />
        <AlertDescription className="text-amber-200">
          Minipizzas hoje são vendidas como produtos normais, cadastrados na página de <strong>Produtos</strong>
          (categoria "MiniPizzas") — é lá que o preço e o custo precisam estar corretos para novas vendas.
          Esta página só existe para consultar/corrigir os dados de <strong>pedidos antigos</strong>, feitos antes
          dessa unificação, e que ainda aparecem nos relatórios financeiros com base nesses valores.
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
                  <TableHead className="text-muted-foreground">Custo</TableHead>
                  <TableHead className="text-muted-foreground">Fornecedor</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map(t => (
                  <TableRow key={t.id} className="border-border hover:bg-muted/20">
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.units} un.</TableCell>
                    <TableCell className="text-primary font-semibold">{fmt(t.price)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmt(t.cost ?? "0")}</TableCell>
                    <TableCell>
                      {t.supplierId ? (
                        <Badge variant="outline" className="text-xs">
                          {suppliers.find(s => s.id === t.supplierId)?.name || `Fornecedor #${t.supplierId}`}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={t.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}>
                        {t.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => openEdit(t)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
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

      {/* Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Minipizza - {editing?.name}</DialogTitle>
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
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Select value={form.supplierId} onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}>
                <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione o fornecedor (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem fornecedor</SelectItem>
                  {suppliers.filter(s => s.active).map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
