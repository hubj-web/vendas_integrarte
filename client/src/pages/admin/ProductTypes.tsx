import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Layers, Tag } from "lucide-react";

export default function ProductTypes() {
  const utils = trpc.useUtils();
  const { data: types = [], isLoading } = trpc.catalog.productTypes.list.useQuery();
  const createMutation = trpc.catalog.productTypes.create.useMutation({ onSuccess: () => { utils.catalog.productTypes.list.invalidate(); toast.success("Tipo criado!"); setOpen(false); } });
  const updateMutation = trpc.catalog.productTypes.update.useMutation({ onSuccess: () => { utils.catalog.productTypes.list.invalidate(); toast.success("Tipo atualizado!"); setOpen(false); } });
  const deleteMutation = trpc.catalog.productTypes.delete.useMutation({
    onSuccess: () => { utils.catalog.productTypes.list.invalidate(); toast.success("Tipo excluído!"); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  const { data: categories = [] } = trpc.catalog.categories.list.useQuery();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id: number; name: string; categoryId: number | null; description: string | null; active: boolean } | null>(null);
  const [form, setForm] = useState({ name: "", categoryId: "", description: "", active: true });

  function openCreate() {
    setEditing(null);
    setForm({ name: "", categoryId: "", description: "", active: true });
    setOpen(true);
  }

  function openEdit(t: typeof types[0]) {
    setEditing({ id: t.id, name: t.name, categoryId: t.categoryId ?? null, description: t.description ?? null, active: t.active });
    setForm({
      name: t.name,
      categoryId: t.categoryId ? String(t.categoryId) : "",
      description: t.description ?? "",
      active: t.active,
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const categoryId = form.categoryId && form.categoryId !== "none" ? Number(form.categoryId) : null;
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        name: form.name,
        categoryId,
        description: form.description || undefined,
        active: form.active,
      });
    } else {
      createMutation.mutate({
        name: form.name,
        categoryId,
        description: form.description || undefined,
      });
    }
  }

  // Agrupar por categoria para exibição
  const grouped: Record<string, typeof types> = {};
  const uncategorized: typeof types = [];
  for (const t of types) {
    if (t.categoryName) {
      if (!grouped[t.categoryName]) grouped[t.categoryName] = [];
      grouped[t.categoryName].push(t);
    } else {
      uncategorized.push(t);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tipos de Produtos"
        description="Gerencie os tipos e categorias de produtos do sistema"
        actions={<Button onClick={openCreate} className="bg-primary text-primary-foreground gap-2"><Plus className="w-4 h-4" />Novo Tipo</Button>}
      />

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-card border-border h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {[...Object.entries(grouped), ...(uncategorized.length > 0 ? [["Sem categoria", uncategorized] as [string, typeof types]] : [])].map(([cat, items]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wide">{cat}</h3>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {items.map(t => (
                  <Card key={t.id} className={`bg-card border-border transition-all hover:border-primary/30 ${!t.active ? "opacity-50" : ""}`}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Layers className="w-4 h-4 text-primary" />
                        </div>
                        <Badge className={t.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs" : "bg-muted text-muted-foreground text-xs"}>
                          {t.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <p className="font-semibold text-foreground text-sm">{t.name}</p>
                      {t.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.description}</p>}
                      <div className="flex items-center gap-1 mt-3">
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-primary" onClick={() => openEdit(t)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => setDeleteId(t.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
          {/* Add new card */}
          <Card
            className="bg-card border-border border-dashed hover:border-primary/40 cursor-pointer transition-all group"
            onClick={openCreate}
          >
            <CardContent className="pt-4 pb-3 flex flex-col items-center justify-center h-full min-h-[100px] gap-2">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
              </div>
              <p className="text-xs text-muted-foreground group-hover:text-primary transition-colors">Novo tipo</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Tipo" : "Novo Tipo de Produto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="bg-input" placeholder="Ex: Pão de Queijo" />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                <SelectTrigger className="bg-input">
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Crie categorias em <strong>Configurações → Categorias</strong></p>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-input" />
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
                <Label>Tipo ativo</Label>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary text-primary-foreground">
                {editing ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo?</AlertDialogTitle>
            <AlertDialogDescription>Tipos com produtos associados não podem ser excluídos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-white">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
