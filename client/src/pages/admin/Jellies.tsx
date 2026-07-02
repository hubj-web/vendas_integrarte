import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function Jellies() {
  const utils = trpc.useUtils();
  const { data: flavors = [], isLoading } = trpc.catalog.jellyFlavors.list.useQuery();
  const createMutation = trpc.catalog.jellyFlavors.create.useMutation({ onSuccess: () => { utils.catalog.jellyFlavors.list.invalidate(); toast.success("Sabor criado!"); setOpen(false); } });
  const updateMutation = trpc.catalog.jellyFlavors.update.useMutation({ onSuccess: () => { utils.catalog.jellyFlavors.list.invalidate(); toast.success("Sabor atualizado!"); setOpen(false); } });
  const deleteMutation = trpc.catalog.jellyFlavors.delete.useMutation({ onSuccess: () => { utils.catalog.jellyFlavors.list.invalidate(); toast.success("Sabor excluído!"); setDeleteId(null); }, onError: e => toast.error(e.message) });

  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", active: true });

  const fmt = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(v));

  return (
    <div>
      <PageHeader
        title="Geleias"
        description="Gerencie os sabores de geleia e seus preços"
        actions={<Button onClick={() => { setEditing(null); setForm({ name: "", description: "", price: "", active: true }); setOpen(true); }} className="bg-primary text-primary-foreground gap-2"><Plus className="w-4 h-4" />Novo Sabor</Button>}
      />
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Sabor</TableHead>
              <TableHead className="text-muted-foreground">Descrição</TableHead>
              <TableHead className="text-muted-foreground">Preço</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-right text-muted-foreground">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flavors.map(f => (
              <TableRow key={f.id} className="border-border hover:bg-muted/20">
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{f.description ?? "—"}</TableCell>
                <TableCell className="text-primary font-semibold">{fmt(f.price)}</TableCell>
                <TableCell><Badge className={f.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}>{f.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => { setEditing(f); setForm({ name: f.name, description: f.description ?? "", price: f.price, active: f.active }); setOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => setDeleteId(f.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Editar Sabor" : "Novo Sabor de Geleia"}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); editing ? updateMutation.mutate({ id: editing.id, name: form.name, description: form.description || undefined, price: form.price, active: form.active }) : createMutation.mutate({ name: form.name, description: form.description || undefined, price: form.price }); }} className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="bg-input" /></div>
            <div className="space-y-2"><Label>Descrição</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-input" /></div>
            <div className="space-y-2"><Label>Preço *</Label><Input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required className="bg-input" /></div>
            {editing && <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} /><Label>Ativo</Label></div>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary text-primary-foreground">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border"><AlertDialogHeader><AlertDialogTitle>Excluir sabor?</AlertDialogTitle><AlertDialogDescription>Sabores com pedidos associados não podem ser excluídos.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-white">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
