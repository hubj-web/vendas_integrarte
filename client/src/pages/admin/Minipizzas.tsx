import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

export default function Minipizzas() {
  const utils = trpc.useUtils();
  const { data: types = [] } = trpc.catalog.minipizzaTypes.list.useQuery();
  const { data: flavors = [] } = trpc.catalog.minipizzaFlavors.list.useQuery();
  const { data: matrix = [] } = trpc.catalog.minipizzaFlavors.getMatrix.useQuery();

  const createTypeMutation = trpc.catalog.minipizzaTypes.create.useMutation({ onSuccess: () => { utils.catalog.minipizzaTypes.list.invalidate(); toast.success("Tipo criado!"); setTypeOpen(false); } });
  const updateTypeMutation = trpc.catalog.minipizzaTypes.update.useMutation({ onSuccess: () => { utils.catalog.minipizzaTypes.list.invalidate(); toast.success("Tipo atualizado!"); setTypeOpen(false); } });
  const deleteTypeMutation = trpc.catalog.minipizzaTypes.delete.useMutation({ onSuccess: () => { utils.catalog.minipizzaTypes.list.invalidate(); toast.success("Tipo excluído!"); setDeleteTypeId(null); }, onError: e => toast.error(e.message) });

  const createFlavorMutation = trpc.catalog.minipizzaFlavors.create.useMutation({ onSuccess: () => { utils.catalog.minipizzaFlavors.list.invalidate(); toast.success("Sabor criado!"); setFlavorOpen(false); } });
  const updateFlavorMutation = trpc.catalog.minipizzaFlavors.update.useMutation({ onSuccess: () => { utils.catalog.minipizzaFlavors.list.invalidate(); toast.success("Sabor atualizado!"); setFlavorOpen(false); } });
  const deleteFlavorMutation = trpc.catalog.minipizzaFlavors.delete.useMutation({ onSuccess: () => { utils.catalog.minipizzaFlavors.list.invalidate(); toast.success("Sabor excluído!"); setDeleteFlavorId(null); } });
  const setCompatMutation = trpc.catalog.minipizzaFlavors.setCompatibility.useMutation({ onSuccess: () => utils.catalog.minipizzaFlavors.getMatrix.invalidate() });

  const [typeOpen, setTypeOpen] = useState(false);
  const [flavorOpen, setFlavorOpen] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const [editingFlavor, setEditingFlavor] = useState<any>(null);
  const [deleteTypeId, setDeleteTypeId] = useState<number | null>(null);
  const [deleteFlavorId, setDeleteFlavorId] = useState<number | null>(null);
  const [typeForm, setTypeForm] = useState({ name: "", units: "", price: "" });
  const [flavorForm, setFlavorForm] = useState({ name: "", description: "", additionalPrice: "0.00" });

  function isCompatible(typeId: number, flavorId: number) {
    return matrix.some(m => m.minipizzaTypeId === typeId && m.minipizzaFlavorId === flavorId && m.active);
  }

  function toggleCompat(typeId: number, flavorId: number) {
    setCompatMutation.mutate({ typeId, flavorId, active: !isCompatible(typeId, flavorId) });
  }

  const fmt = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(v));

  return (
    <div>
      <PageHeader title="Minipizzas" description="Gerencie tipos, sabores e compatibilidades" />

      <Tabs defaultValue="types">
        <TabsList className="bg-muted/30 mb-4">
          <TabsTrigger value="types">Tipos</TabsTrigger>
          <TabsTrigger value="flavors">Sabores</TabsTrigger>
          <TabsTrigger value="matrix">Matriz de Compatibilidade</TabsTrigger>
        </TabsList>

        {/* TYPES */}
        <TabsContent value="types">
          <div className="flex justify-end mb-3">
            <Button onClick={() => { setEditingType(null); setTypeForm({ name: "", units: "", price: "" }); setTypeOpen(true); }} className="bg-primary text-primary-foreground gap-2">
              <Plus className="w-4 h-4" />Novo Tipo
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Nome</TableHead>
                  <TableHead className="text-muted-foreground">Unidades</TableHead>
                  <TableHead className="text-muted-foreground">Preço</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right text-muted-foreground">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map(t => (
                  <TableRow key={t.id} className="border-border hover:bg-muted/20">
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.units} un.</TableCell>
                    <TableCell className="text-primary font-semibold">{fmt(t.price)}</TableCell>
                    <TableCell><Badge className={t.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}>{t.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => { setEditingType(t); setTypeForm({ name: t.name, units: String(t.units), price: t.price }); setTypeOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => setDeleteTypeId(t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* FLAVORS */}
        <TabsContent value="flavors">
          <div className="flex justify-end mb-3">
            <Button onClick={() => { setEditingFlavor(null); setFlavorForm({ name: "", description: "", additionalPrice: "0.00" }); setFlavorOpen(true); }} className="bg-primary text-primary-foreground gap-2">
              <Plus className="w-4 h-4" />Novo Sabor
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Sabor</TableHead>
                  <TableHead className="text-muted-foreground">Descrição</TableHead>
                  <TableHead className="text-muted-foreground">Preço Adicional</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right text-muted-foreground">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flavors.map(f => (
                  <TableRow key={f.id} className="border-border hover:bg-muted/20">
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{f.description ?? "—"}</TableCell>
                    <TableCell>{f.additionalPrice && parseFloat(f.additionalPrice) > 0 ? <span className="text-primary font-semibold">+{fmt(f.additionalPrice)}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><Badge className={f.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}>{f.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => { setEditingFlavor(f); setFlavorForm({ name: f.name, description: f.description ?? "", additionalPrice: f.additionalPrice ?? "0.00" }); setFlavorOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => setDeleteFlavorId(f.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* MATRIX */}
        <TabsContent value="matrix">
          <p className="text-sm text-muted-foreground mb-4">Clique nas células para ativar/desativar a compatibilidade entre tipo e sabor.</p>
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
                          <button
                            onClick={() => toggleCompat(t.id, f.id)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-all ${compat ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}
                          >
                            {compat ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                          </button>
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

      {/* Type Dialog */}
      <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>{editingType ? "Editar Tipo" : "Novo Tipo de Minipizza"}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); editingType ? updateTypeMutation.mutate({ id: editingType.id, name: typeForm.name, units: Number(typeForm.units), price: typeForm.price }) : createTypeMutation.mutate({ name: typeForm.name, units: Number(typeForm.units), price: typeForm.price }); }} className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={typeForm.name} onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))} required className="bg-input" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Qtd. Unidades *</Label><Input type="number" min="1" value={typeForm.units} onChange={e => setTypeForm(f => ({ ...f, units: e.target.value }))} required className="bg-input" /></div>
              <div className="space-y-2"><Label>Preço *</Label><Input type="number" step="0.01" min="0" value={typeForm.price} onChange={e => setTypeForm(f => ({ ...f, price: e.target.value }))} required className="bg-input" /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTypeOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary text-primary-foreground">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Flavor Dialog */}
      <Dialog open={flavorOpen} onOpenChange={setFlavorOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>{editingFlavor ? "Editar Sabor" : "Novo Sabor"}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); editingFlavor ? updateFlavorMutation.mutate({ id: editingFlavor.id, name: flavorForm.name, description: flavorForm.description || undefined, additionalPrice: flavorForm.additionalPrice }) : createFlavorMutation.mutate({ name: flavorForm.name, description: flavorForm.description || undefined, additionalPrice: flavorForm.additionalPrice }); }} className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={flavorForm.name} onChange={e => setFlavorForm(f => ({ ...f, name: e.target.value }))} required className="bg-input" /></div>
            <div className="space-y-2"><Label>Descrição</Label><Input value={flavorForm.description} onChange={e => setFlavorForm(f => ({ ...f, description: e.target.value }))} className="bg-input" /></div>
            <div className="space-y-2"><Label>Preço Adicional</Label><Input type="number" step="0.01" min="0" value={flavorForm.additionalPrice} onChange={e => setFlavorForm(f => ({ ...f, additionalPrice: e.target.value }))} className="bg-input" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFlavorOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary text-primary-foreground">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTypeId !== null} onOpenChange={() => setDeleteTypeId(null)}>
        <AlertDialogContent className="bg-card border-border"><AlertDialogHeader><AlertDialogTitle>Excluir tipo?</AlertDialogTitle><AlertDialogDescription>Tipos com pedidos associados não podem ser excluídos.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteTypeId && deleteTypeMutation.mutate({ id: deleteTypeId })} className="bg-destructive text-white">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteFlavorId !== null} onOpenChange={() => setDeleteFlavorId(null)}>
        <AlertDialogContent className="bg-card border-border"><AlertDialogHeader><AlertDialogTitle>Excluir sabor?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteFlavorId && deleteFlavorMutation.mutate({ id: deleteFlavorId })} className="bg-destructive text-white">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
