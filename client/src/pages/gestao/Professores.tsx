import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Users, Pencil, UserX, Search } from "lucide-react";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const emptyForm = {
  nomeCompleto: "", cpf: "", email: "", telefone: "",
  valorBolsaMensal: "0.00", chavePix: "", observacoes: "",
  modalidadeIds: [] as number[],
};

export default function Professores() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const { data: professoresList, isLoading } = trpc.gestao.professores.list.useQuery({ search: search || undefined });
  const { data: modalidades } = trpc.gestao.modalidades.list.useQuery();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deactivateId, setDeactivateId] = useState<{ id: number; nome: string } | null>(null);

  const createMutation = trpc.gestao.professores.create.useMutation({
    onSuccess: () => { utils.gestao.professores.list.invalidate(); toast.success("Professor cadastrado!"); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.gestao.professores.update.useMutation({
    onSuccess: () => { utils.gestao.professores.list.invalidate(); toast.success("Professor atualizado!"); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.gestao.professores.delete.useMutation({
    onSuccess: () => { utils.gestao.professores.list.invalidate(); toast.success("Professor desativado."); setDeactivateId(null); },
    onError: (e) => toast.error(e.message),
  });

  const activeModalidades = modalidades?.filter(m => m.active) ?? [];

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(p: any) {
    setEditId(p.id);
    setForm({
      nomeCompleto: p.nomeCompleto ?? "", cpf: p.cpf ?? "", email: p.email ?? "", telefone: p.telefone ?? "",
      valorBolsaMensal: p.valorBolsaMensal ?? "0.00", chavePix: p.chavePix ?? "", observacoes: p.observacoes ?? "",
      modalidadeIds: (p.modalidades ?? []).map((m: any) => m.id),
    });
    setOpen(true);
  }

  function toggleModalidade(id: number) {
    setForm(f => ({
      ...f,
      modalidadeIds: f.modalidadeIds.includes(id) ? f.modalidadeIds.filter(x => x !== id) : [...f.modalidadeIds, id],
    }));
  }

  function handleSave() {
    if (!form.nomeCompleto.trim()) { toast.error("Informe o nome completo."); return; }
    if (editId) {
      updateMutation.mutate({ id: editId, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-foreground">Professores</h2>
        </div>
        <Button onClick={openCreate} className="gap-1.5 bg-purple-600 hover:bg-purple-700">
          <Plus className="w-4 h-4" /> Novo Professor
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : professoresList?.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum professor cadastrado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {professoresList?.map((p: any) => (
            <Card key={p.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{p.nomeCompleto}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.telefone || "—"} {p.email ? `• ${p.email}` : ""}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {(p.modalidades ?? []).map((m: any) => (
                      <Badge key={m.id} className="bg-purple-50 text-purple-700 border-purple-200 text-xs">{m.nome}</Badge>
                    ))}
                    {(p.modalidades ?? []).length === 0 && <span className="text-xs text-muted-foreground">Sem modalidade vinculada</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-purple-700">{fmt(p.valorBolsaMensal)}/mês</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => setDeactivateId({ id: p.id, nome: p.nomeCompleto })}>
                    <UserX className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Editar Professor" : "Novo Professor"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome completo *</Label>
              <Input value={form.nomeCompleto} onChange={(e) => setForm(f => ({ ...f, nomeCompleto: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={(e) => setForm(f => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={(e) => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Modalidade(s) que leciona</Label>
              <div className="flex flex-wrap gap-2">
                {activeModalidades.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleModalidade(m.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      form.modalidadeIds.includes(m.id)
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white text-muted-foreground border-gray-200 hover:border-purple-300"
                    }`}
                  >
                    {m.nome}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor da bolsa cultura (mensal)</Label>
                <Input
                  type="number" step="0.01"
                  value={form.valorBolsaMensal}
                  onChange={(e) => setForm(f => ({ ...f, valorBolsaMensal: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Chave PIX</Label>
                <Input value={form.chavePix} onChange={(e) => setForm(f => ({ ...f, chavePix: e.target.value }))} placeholder="CPF, e-mail, telefone..." />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => setForm(f => ({ ...f, observacoes: e.target.value }))} className="min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateId} onOpenChange={(v) => !v && setDeactivateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar "{deactivateId?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>O professor deixa de aparecer nas listas ativas e não gera mais bolsa cultura mensal. O histórico é mantido.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deactivateId && deleteMutation.mutate({ id: deactivateId.id })} className="bg-destructive text-white">
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
