import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tag, GripVertical, CheckCircle, XCircle, ImagePlus, Image as ImageIcon } from "lucide-react";
import { compressImageFile } from "@/lib/imageCompress";

type Category = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  displaySize: "pequeno" | "medio" | "grande";
  active: boolean;
  createdAt: Date;
};

type FormData = {
  name: string;
  description: string;
  sortOrder: number;
  displaySize: "pequeno" | "medio" | "grande";
};

export default function Categories() {
  const utils = trpc.useUtils();
  const { data: categories = [], isLoading } = trpc.catalog.categories.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>({ name: "", description: "", sortOrder: 0, displaySize: "medio" });

  const createMutation = trpc.catalog.categories.create.useMutation({
    onSuccess: () => { utils.catalog.categories.list.invalidate(); toast.success("Categoria criada!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.catalog.categories.update.useMutation({
    onSuccess: () => { utils.catalog.categories.list.invalidate(); utils.catalog.productTypes.list.invalidate(); toast.success("Categoria atualizada!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.catalog.categories.delete.useMutation({
    onSuccess: () => { utils.catalog.categories.list.invalidate(); toast.success("Categoria excluída!"); setDeleteDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const toggleActiveMutation = trpc.catalog.categories.update.useMutation({
    onSuccess: () => { utils.catalog.categories.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const uploadImageMutation = trpc.catalog.categories.uploadImage.useMutation({
    onSuccess: () => { utils.catalog.categories.list.invalidate(); toast.success("Imagem atualizada!"); },
    onError: (e) => toast.error(e.message),
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageFile(id: number, file: File) {
    compressImageFile(file)
      .then((base64) => {
        setImagePreview(base64);
        uploadImageMutation.mutate({ id, imageBase64: base64 });
      })
      .catch(() => toast.error("Não foi possível processar essa imagem."));
  }

  function openCreate() {
    setEditingCategory(null);
    setImagePreview(null);
    setForm({ name: "", description: "", sortOrder: (categories.length) * 10, displaySize: "medio" });
    setDialogOpen(true);
  }

  function openEdit(cat: Category) {
    setEditingCategory(cat);
    setImagePreview(cat.imageUrl ?? null);
    setForm({ name: cat.name, description: cat.description ?? "", sortOrder: cat.sortOrder, displaySize: cat.displaySize ?? "medio" });
    setDialogOpen(true);
  }

  function openDelete(id: number) {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, name: form.name, description: form.description || undefined, sortOrder: form.sortOrder, displaySize: form.displaySize });
    } else {
      createMutation.mutate({ name: form.name, description: form.description || undefined, sortOrder: form.sortOrder, displaySize: form.displaySize });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tag className="w-6 h-6 text-blue-600" />
            Categorias de Produtos
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie as categorias que agrupam os tipos de produto</p>
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <Plus className="w-4 h-4" /> Nova Categoria
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Nenhuma categoria cadastrada</p>
          <p className="text-sm mt-1">Crie categorias para organizar os tipos de produto</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className={`flex items-center gap-4 p-4 rounded-xl border bg-white shadow-sm transition-all ${!cat.active ? "opacity-60" : ""}`}
            >
              <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
              {cat.imageUrl ? (
                <img src={cat.imageUrl} alt={cat.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <ImageIcon className="w-4 h-4 text-gray-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{cat.name}</span>
                  {!cat.active && <Badge variant="secondary" className="text-xs">Inativa</Badge>}
                </div>
                {cat.description && <p className="text-sm text-gray-500 mt-0.5 truncate">{cat.description}</p>}
                <p className="text-xs text-gray-400 mt-0.5">Ordem: {cat.sortOrder}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost" size="icon"
                  className={cat.active ? "text-green-600 hover:text-green-700 hover:bg-green-50" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}
                  title={cat.active ? "Desativar" : "Ativar"}
                  onClick={() => toggleActiveMutation.mutate({ id: cat.id, active: !cat.active })}
                >
                  {cat.active ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="text-blue-600 hover:bg-blue-50" onClick={() => openEdit(cat)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50" onClick={() => openDelete(cat.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Imagem da categoria (aparece na Loja Pública)</Label>
              <div className="mt-1 flex items-center gap-3">
                {imagePreview ? (
                  <img src={imagePreview} alt="Prévia" className="w-16 h-16 rounded-lg object-cover border" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center border">
                    <ImageIcon className="w-5 h-5 text-gray-300" />
                  </div>
                )}
                {editingCategory ? (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={uploadImageMutation.isPending}>
                    <ImagePlus className="w-4 h-4" /> {uploadImageMutation.isPending ? "Enviando…" : "Escolher imagem"}
                  </Button>
                ) : (
                  <p className="text-xs text-gray-400">Salve a categoria primeiro pra poder adicionar uma imagem.</p>
                )}
                <input
                  ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const file = e.target.files?.[0]; if (file && editingCategory) handleImageFile(editingCategory.id, file); }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Qualquer tamanho serve — a foto é redimensionada automaticamente pra até 800×800px antes de salvar.
              </p>
            </div>
            <div>
              <Label htmlFor="cat-name">Nome *</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Produtos Congelados"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cat-desc">Descrição</Label>
              <Textarea
                id="cat-desc"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descrição opcional da categoria"
                className="mt-1 resize-none"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="cat-order">Ordem de exibição</Label>
              <Input
                id="cat-order"
                type="number"
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                placeholder="0"
                className="mt-1 w-32"
              />
              <p className="text-xs text-gray-400 mt-1">Menor número aparece primeiro</p>
            </div>
            <div>
              <Label>Tamanho de destaque na Loja Pública</Label>
              <Select value={form.displaySize} onValueChange={(v) => setForm(f => ({ ...f, displaySize: v as any }))}>
                <SelectTrigger className="mt-1 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pequeno">Pequeno</SelectItem>
                  <SelectItem value="medio">Médio</SelectItem>
                  <SelectItem value="grande">Grande</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">"Grande" ocupa mais espaço na grade, chamando mais atenção.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isPending ? "Salvando..." : editingCategory ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Se houver tipos de produto vinculados a esta categoria, a exclusão será bloqueada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deletingId && deleteMutation.mutate({ id: deletingId })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
