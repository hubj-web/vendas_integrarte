import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Package } from "lucide-react";

type Product = {
  id: number; name: string; unit: string; price: string;
  description: string | null; active: boolean;
  productTypeId: number; typeName: string | null;
  categoryId?: number | null; categoryName?: string | null;
};

const units = ["bandeja", "caixa", "pote", "unidade", "pacote", "kg", "g", "litro", "ml"];

export default function Products() {
  const utils = trpc.useUtils();
  const { data: categories = [] } = trpc.catalog.categories.list.useQuery();
  const { data: types = [] } = trpc.catalog.productTypes.list.useQuery();
  const { data: products = [], isLoading } = trpc.catalog.products.list.useQuery();
  const createMutation = trpc.catalog.products.create.useMutation({ onSuccess: () => { utils.catalog.products.list.invalidate(); toast.success("Produto criado!"); setOpen(false); } });
  const updateMutation = trpc.catalog.products.update.useMutation({ onSuccess: () => { utils.catalog.products.list.invalidate(); toast.success("Produto atualizado!"); setOpen(false); } });
  const deleteMutation = trpc.catalog.products.delete.useMutation({ onSuccess: () => { utils.catalog.products.list.invalidate(); toast.success("Produto excluído!"); setDeleteId(null); } });

  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const [form, setForm] = useState({ name: "", categoryId: "", unit: "unidade", price: "", description: "", active: true });

  // Obter tipos filtrados pela categoria selecionada
  const typesForCategory = form.categoryId
    ? types.filter(t => String(t.categoryId) === form.categoryId)
    : types;

  function openCreate() {
    setEditing(null);
    setForm({ name: "", categoryId: "", unit: "unidade", price: "", description: "", active: true });
    setOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    // Encontrar a categoria do tipo de produto
    const type = types.find(t => t.id === p.productTypeId);
    const catId = type?.categoryId ? String(type.categoryId) : (p.categoryId ? String(p.categoryId) : "");
    setForm({ name: p.name, categoryId: catId, unit: p.unit, price: p.price, description: p.description ?? "", active: p.active });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.categoryId) return toast.error("Selecione uma categoria.");

    // Encontrar ou usar o primeiro tipo da categoria selecionada
    const categoryTypes = types.filter(t => String(t.categoryId) === form.categoryId);
    let productTypeId: number;

    if (categoryTypes.length > 0) {
      productTypeId = categoryTypes[0].id;
    } else {
      // Se não tem tipo para essa categoria, usar tipo genérico (id 5 - Outros)
      const genericType = types.find(t => t.name === "Outros");
      productTypeId = genericType?.id ?? 1;
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, name: form.name, productTypeId, unit: form.unit, price: form.price, description: form.description, active: form.active });
    } else {
      createMutation.mutate({ name: form.name, productTypeId, unit: form.unit, price: form.price, description: form.description || undefined, active: form.active });
    }
  }

  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory !== "all") {
      const type = types.find(t => t.id === p.productTypeId);
      if (!type || String(type.categoryId) !== filterCategory) return false;
    }
    return true;
  });

  const fmt = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(v));

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Gerencie o catálogo de produtos"
        actions={<Button onClick={openCreate} className="bg-primary text-primary-foreground gap-2"><Plus className="w-4 h-4" />Novo Produto</Button>}
      />

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-input" />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-44 bg-input"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Nome</TableHead>
              <TableHead className="text-muted-foreground">Categoria</TableHead>
              <TableHead className="text-muted-foreground">Unidade</TableHead>
              <TableHead className="text-muted-foreground">Preço</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  {Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Nenhum produto encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(p => {
                const type = types.find(t => t.id === p.productTypeId);
                const catName = type?.categoryName || p.categoryName || "Sem categoria";
                return (
                  <TableRow key={p.id} className="border-border hover:bg-muted/20">
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{catName}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{p.unit}</TableCell>
                    <TableCell className="font-semibold text-primary">{fmt(p.price)}</TableCell>
                    <TableCell>
                      <Badge className={p.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}>
                        {p.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="bg-input" />
            </div>
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent>
                  {categories.filter(c => c.active).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Unidade *</Label>
                <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger className="bg-input"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {units.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Preço Unitário *</Label>
                <Input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required className="bg-input" placeholder="0,00" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-input" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
              <Label>Produto ativo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary text-primary-foreground" disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Produtos com pedidos associados não podem ser excluídos — desative-os em vez disso.</AlertDialogDescription>
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
