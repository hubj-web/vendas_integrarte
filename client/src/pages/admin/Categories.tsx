import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  availableFrom: string | Date | null;
  availableUntil: string | Date | null;
  popupEnabled: boolean;
  popupMessage: string | null;
  active: boolean;
  createdAt: Date;
};

type FormData = {
  name: string;
  description: string;
  sortOrder: number;
  displaySize: "pequeno" | "medio" | "grande";
  availableFrom: string;
  availableUntil: string;
  popupEnabled: boolean;
  popupMessage: string;
};

export default function Categories() {
  const utils = trpc.useUtils();
  const { data: categories = [], isLoading } = trpc.catalog.categories.list.useQuery();

  // Lista local, pra poder reordenar visualmente antes de salvar (arrastar)
  const [orderedList, setOrderedList] = useState<Category[]>([]);
  useEffect(() => { setOrderedList(categories); }, [categories]);
  const dragIndexRef = useRef<number | null>(null);

  const reorderMutation = trpc.catalog.categories.reorder.useMutation({
    onSuccess: () => utils.catalog.categories.list.invalidate(),
    onError: (e) => { toast.error(e.message); utils.catalog.categories.list.invalidate(); },
  });

  function saveOrder(list: Category[]) {
    reorderMutation.mutate({ items: list.map((c, i) => ({ id: c.id, sortOrder: i * 10 })) });
  }

  function handleDrop(dropIndex: number) {
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) return;
    const next = [...orderedList];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    setOrderedList(next);
    saveOrder(next);
    dragIndexRef.current = null;
  }

  function sortAlphabetically() {
    const next = [...orderedList].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    setOrderedList(next);
    saveOrder(next);
    toast.success("Ordenado alfabeticamente!");
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>({ name: "", description: "", sortOrder: 0, displaySize: "medio", availableFrom: "", availableUntil: "", popupEnabled: false, popupMessage: "" });

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
    setForm({ name: "", description: "", sortOrder: (categories.length) * 10, displaySize: "medio", availableFrom: "", availableUntil: "", popupEnabled: false, popupMessage: "" });
    setDialogOpen(true);
  }

  function toDatetimeLocal(v: string | Date) {
    const d = new Date(v);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openEdit(cat: Category) {
    setEditingCategory(cat);
    setImagePreview(cat.imageUrl ?? null);
    setForm({
      name: cat.name, description: cat.description ?? "", sortOrder: cat.sortOrder, displaySize: cat.displaySize ?? "medio",
      availableFrom: cat.availableFrom ? toDatetimeLocal(cat.availableFrom) : "",
      availableUntil: cat.availableUntil ? toDatetimeLocal(cat.availableUntil) : "",
      popupEnabled: cat.popupEnabled ?? false, popupMessage: cat.popupMessage ?? "",
    });
    setDialogOpen(true);
  }

  function openDelete(id: number) {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editingCategory) {
      updateMutation.mutate({
        id: editingCategory.id, name: form.name, description: form.description || undefined, sortOrder: form.sortOrder, displaySize: form.displaySize,
        availableFrom: form.availableFrom || null, availableUntil: form.availableUntil || null,
        popupEnabled: form.popupEnabled, popupMessage: form.popupMessage || null,
      });
    } else {
      createMutation.mutate({
        name: form.name, description: form.description || undefined, sortOrder: form.sortOrder, displaySize: form.displaySize,
        availableFrom: form.availableFrom || undefined, availableUntil: form.availableUntil || undefined,
        popupEnabled: form.popupEnabled, popupMessage: form.popupMessage || undefined,
      });
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
          <p className="text-sm text-gray-500 mt-1">Gerencie as categorias que agrupam os tipos de produto — arraste pela ⠿ pra reordenar manualmente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={sortAlphabetically} disabled={reorderMutation.isPending}>
            Ordenar A-Z
          </Button>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Plus className="w-4 h-4" /> Nova Categoria
          </Button>
        </div>
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
          {orderedList.map((cat, index) => (
            <div
              key={cat.id}
              draggable
              onDragStart={() => { dragIndexRef.current = index; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(index)}
              className={`flex items-center gap-4 p-4 rounded-xl border bg-white shadow-sm transition-all ${!cat.active ? "opacity-60" : ""}`}
            >
              <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0 cursor-grab active:cursor-grabbing" />
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
            <div>
              <Label>Disponível na Loja de / até (opcional)</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Input type="datetime-local" value={form.availableFrom} onChange={e => setForm(f => ({ ...f, availableFrom: e.target.value }))} />
                <Input type="datetime-local" value={form.availableUntil} onChange={e => setForm(f => ({ ...f, availableUntil: e.target.value }))} />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Deixe em branco pra sempre disponível. Preenchendo, essa categoria (e os produtos dela) só aparecem
                na loja dentro dessa janela — ex: sobremesa que libera só no dia/horário do evento.
              </p>
            </div>
            <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer" htmlFor="popup-enabled">Mostrar pop-up de aviso ao entrar na categoria</Label>
                <Switch id="popup-enabled" checked={form.popupEnabled} onCheckedChange={v => setForm(f => ({ ...f, popupEnabled: v }))} />
              </div>
              {form.popupEnabled && (
                <div>
                  <Label className="text-xs">Mensagem do pop-up</Label>
                  <Textarea
                    rows={4} value={form.popupMessage}
                    onChange={e => setForm(f => ({ ...f, popupMessage: e.target.value }))}
                    placeholder="Ex: Esses quadros são pintados à mão, cada um é único — o tempo de produção pode levar até 15 dias."
                  />
                </div>
              )}
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
