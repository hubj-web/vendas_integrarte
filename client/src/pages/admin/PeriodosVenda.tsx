import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, CalendarRange, CheckCircle2, XCircle, Trash2, Pencil } from "lucide-react";

function fmtData(v: string | Date) {
  return new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PeriodosVenda() {
  const utils = trpc.useUtils();
  const { data: periodos, isLoading } = trpc.periodosVenda.list.useQuery();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ descricao: "", dataAbertura: "", dataFechamento: "" });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createMutation = trpc.periodosVenda.create.useMutation({
    onSuccess: () => { utils.periodosVenda.list.invalidate(); toast.success("Período criado!"); closeDialog(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.periodosVenda.update.useMutation({
    onSuccess: () => { utils.periodosVenda.list.invalidate(); toast.success("Período atualizado!"); closeDialog(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.periodosVenda.delete.useMutation({
    onSuccess: () => { utils.periodosVenda.list.invalidate(); toast.success("Período removido."); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  function closeDialog() {
    setOpen(false);
    setEditId(null);
    setForm({ descricao: "", dataAbertura: "", dataFechamento: "" });
  }

  function toDatetimeLocal(v: string | Date) {
    const d = new Date(v);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openEdit(p: { id: number; descricao: string | null; dataAbertura: string | Date; dataFechamento: string | Date }) {
    setEditId(p.id);
    setForm({
      descricao: p.descricao ?? "",
      dataAbertura: toDatetimeLocal(p.dataAbertura),
      dataFechamento: toDatetimeLocal(p.dataFechamento),
    });
    setOpen(true);
  }

  const hoje = new Date();
  const periodoAtivo = periodos?.find(p => new Date(p.dataAbertura) <= hoje && new Date(p.dataFechamento) >= hoje);

  function handleSave() {
    if (!form.dataAbertura || !form.dataFechamento) {
      toast.error("Informe as duas datas.");
      return;
    }
    if (editId) {
      updateMutation.mutate({ id: editId, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  return (
    <div>
      <PageHeader
        title="Período de Vendas"
        description="Controle quando os vendedores podem lançar pedido normal — fora do período, só é possível vender o que já está no Integrarte Estoque"
        actions={
          <Button onClick={() => { setEditId(null); setForm({ descricao: "", dataAbertura: "", dataFechamento: "" }); setOpen(true); }} className="gap-1.5">
            <Plus className="w-4 h-4" /> Abrir Novo Período
          </Button>
        }
      />

      <div className="mb-6">
        {periodoAtivo ? (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
              <div>
                <p className="font-semibold text-foreground">Período de vendas ABERTO</p>
                <p className="text-sm text-muted-foreground">
                  {periodoAtivo.descricao || "Período atual"} — {fmtData(periodoAtivo.dataAbertura)} até {fmtData(periodoAtivo.dataFechamento)}.
                  Vendedores podem lançar pedidos normalmente.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="w-6 h-6 text-orange-500 shrink-0" />
              <div>
                <p className="font-semibold text-foreground">Período de vendas FECHADO</p>
                <p className="text-sm text-muted-foreground">
                  Vendedores só conseguem vender o que já está no Integrarte Estoque. Abra um novo
                  período quando quiser liberar o lançamento normal de pedidos.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
        <CalendarRange className="w-4 h-4" /> Histórico de períodos
      </h3>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : periodos?.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum período cadastrado ainda.</p>
      ) : (
        <div className="space-y-2">
          {periodos?.map((p) => {
            const ativo = new Date(p.dataAbertura) <= hoje && new Date(p.dataFechamento) >= hoje;
            const futuro = new Date(p.dataAbertura) > hoje;
            return (
              <Card key={p.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{p.descricao || `Período #${p.id}`}</p>
                      {ativo && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Ativo agora</Badge>}
                      {futuro && <Badge variant="outline" className="text-xs">Futuro</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{fmtData(p.dataAbertura)} até {fmtData(p.dataFechamento)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => setDeleteId(p.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar Período de Vendas" : "Abrir Novo Período de Vendas"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input placeholder="Ex: Período de Agosto/2026" value={form.descricao} onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Abertura (data e hora)</Label>
                <Input type="datetime-local" value={form.dataAbertura} onChange={(e) => setForm(f => ({ ...f, dataAbertura: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Fechamento (data e hora)</Label>
                <Input type="datetime-local" value={form.dataFechamento} onChange={(e) => setForm(f => ({ ...f, dataFechamento: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {editId ? "Salvar Alterações" : "Abrir Período"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este período?</AlertDialogTitle>
            <AlertDialogDescription>
              Se esse for o período ativo, os vendedores voltam a ficar restritos ao Integrarte Estoque imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-white">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
