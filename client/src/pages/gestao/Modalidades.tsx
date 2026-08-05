import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Tags, Pencil, Trash2 } from "lucide-react";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export default function Modalidades() {
  const utils = trpc.useUtils();
  const { data: modalidades, isLoading } = trpc.gestao.modalidades.list.useQuery();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ nome: "", grupoExclusivo: false, valorMensal: "50.00", idadeMinima: "", idadeMaxima: "" });

  const createMutation = trpc.gestao.modalidades.create.useMutation({
    onSuccess: () => { utils.gestao.modalidades.list.invalidate(); toast.success("Modalidade criada!"); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.gestao.modalidades.update.useMutation({
    onSuccess: () => { utils.gestao.modalidades.list.invalidate(); toast.success("Modalidade atualizada!"); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.gestao.modalidades.delete.useMutation({
    onSuccess: () => { utils.gestao.modalidades.list.invalidate(); toast.success("Modalidade desativada."); },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setEditId(null);
    setForm({ nome: "", grupoExclusivo: false, valorMensal: "50.00", idadeMinima: "", idadeMaxima: "" });
    setOpen(true);
  }

  function openEdit(m: { id: number; nome: string; grupoExclusivo: boolean; valorMensal: string; idadeMinima?: number | null; idadeMaxima?: number | null }) {
    setEditId(m.id);
    setForm({
      nome: m.nome, grupoExclusivo: m.grupoExclusivo, valorMensal: m.valorMensal,
      idadeMinima: m.idadeMinima != null ? String(m.idadeMinima) : "",
      idadeMaxima: m.idadeMaxima != null ? String(m.idadeMaxima) : "",
    });
    setOpen(true);
  }

  function handleSave() {
    if (!form.nome.trim()) { toast.error("Informe o nome da modalidade."); return; }
    const payload = {
      nome: form.nome, grupoExclusivo: form.grupoExclusivo, valorMensal: form.valorMensal,
      idadeMinima: form.idadeMinima ? Number(form.idadeMinima) : null,
      idadeMaxima: form.idadeMaxima ? Number(form.idadeMaxima) : null,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tags className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-foreground">Modalidades</h2>
        </div>
        <Button onClick={openCreate} className="gap-1.5 bg-purple-600 hover:bg-purple-700">
          <Plus className="w-4 h-4" /> Nova Modalidade
        </Button>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Modalidades marcadas como "grupo exclusivo" competem entre si — um aluno só pode escolher
        UMA delas (hoje: Canto, Violão, Dança). As demais (ex: Teatro) podem ser combinadas livremente.
      </p>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : (
        <div className="space-y-2.5">
          {modalidades?.map((m) => (
            <Card key={m.id} className={!m.active ? "opacity-50" : ""}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-semibold text-foreground">{m.nome}</p>
                  {m.grupoExclusivo && <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs">Grupo exclusivo</Badge>}
                  {(m.idadeMinima || m.idadeMaxima) && (
                    <Badge variant="outline" className="text-xs">
                      {m.idadeMinima && m.idadeMaxima ? `${m.idadeMinima}-${m.idadeMaxima} anos` : m.idadeMinima ? `${m.idadeMinima}+ anos` : `até ${m.idadeMaxima} anos`}
                    </Badge>
                  )}
                  {!m.active && <Badge variant="outline" className="text-xs">Inativa</Badge>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-medium text-foreground">{fmt(m.valorMensal)}/mês</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)}><Pencil className="w-3.5 h-3.5" /></Button>
                  {m.active && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => deleteMutation.mutate({ id: m.id })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar Modalidade" : "Nova Modalidade"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Pintura" />
            </div>
            <div className="space-y-1.5">
              <Label>Valor mensal</Label>
              <Input
                type="number" step="0.01"
                value={form.valorMensal}
                onChange={(e) => setForm(f => ({ ...f, valorMensal: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Idade mínima</Label>
                <Input type="number" placeholder="Sem mínimo" value={form.idadeMinima} onChange={(e) => setForm(f => ({ ...f, idadeMinima: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Idade máxima</Label>
                <Input type="number" placeholder="Sem máximo" value={form.idadeMaxima} onChange={(e) => setForm(f => ({ ...f, idadeMaxima: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Grupo exclusivo</Label>
                <p className="text-xs text-muted-foreground">Compete com outras do mesmo grupo (ex: mesmo horário)</p>
              </div>
              <Switch checked={form.grupoExclusivo} onCheckedChange={(v) => setForm(f => ({ ...f, grupoExclusivo: v }))} />
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
    </div>
  );
}
