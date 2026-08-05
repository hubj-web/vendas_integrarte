import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, GraduationCap, Pencil, UserX, Search } from "lucide-react";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

function calcIdade(dataNascimento: string): number | null {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

const emptyForm = {
  nomeCompleto: "", dataNascimento: "", cpf: "", email: "", telefone: "",
  maiorIdade: true,
  responsavelNome: "", responsavelVinculo: "", responsavelEmail: "", responsavelTelefone: "",
  responsavelPresenteMenor10: false,
  autorizacaoImagem: false, possuiDeficiencia: false, deficienciaQual: "",
  observacoes: "",
  modalidadeIds: [] as number[],
};

export default function Alunos() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const { data: alunosList, isLoading } = trpc.gestao.alunos.list.useQuery({ search: search || undefined, onlyActive: !showInactive });
  const { data: modalidades } = trpc.gestao.modalidades.list.useQuery();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deactivateId, setDeactivateId] = useState<{ id: number; nome: string } | null>(null);
  const [desistenteDialog, setDesistenteDialog] = useState<{ id: number; nome: string } | null>(null);
  const [motivoDesistencia, setMotivoDesistencia] = useState("");

  const createMutation = trpc.gestao.alunos.create.useMutation({
    onSuccess: () => { utils.gestao.alunos.list.invalidate(); toast.success("Aluno cadastrado!"); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.gestao.alunos.update.useMutation({
    onSuccess: () => { utils.gestao.alunos.list.invalidate(); toast.success("Aluno atualizado!"); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.gestao.alunos.delete.useMutation({
    onSuccess: () => { utils.gestao.alunos.list.invalidate(); toast.success("Aluno desativado."); setDeactivateId(null); },
    onError: (e) => toast.error(e.message),
  });
  const desistenteMutation = trpc.gestao.alunos.marcarDesistente.useMutation({
    onSuccess: () => { utils.gestao.alunos.list.invalidate(); toast.success("Desistência registrada."); setDesistenteDialog(null); },
    onError: (e) => toast.error(e.message),
  });
  const reativarMutation = trpc.gestao.alunos.reativar.useMutation({
    onSuccess: () => { utils.gestao.alunos.list.invalidate(); toast.success("Aluno reativado!"); },
    onError: (e) => toast.error(e.message),
  });

  const activeModalidades = modalidades?.filter(m => m.active) ?? [];
  const grupoExclusivo = activeModalidades.filter(m => m.grupoExclusivo);
  const naoExclusivas = activeModalidades.filter(m => !m.grupoExclusivo);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(a: any) {
    setEditId(a.id);
    setForm({
      nomeCompleto: a.nomeCompleto ?? "",
      dataNascimento: a.dataNascimento ? new Date(a.dataNascimento).toISOString().slice(0, 10) : "",
      cpf: a.cpf ?? "", email: a.email ?? "", telefone: a.telefone ?? "",
      maiorIdade: a.maiorIdade,
      responsavelNome: a.responsavelNome ?? "", responsavelVinculo: a.responsavelVinculo ?? "",
      responsavelEmail: a.responsavelEmail ?? "", responsavelTelefone: a.responsavelTelefone ?? "",
      responsavelPresenteMenor10: !!a.responsavelPresenteMenor10,
      autorizacaoImagem: !!a.autorizacaoImagem, possuiDeficiencia: !!a.possuiDeficiencia,
      deficienciaQual: a.deficienciaQual ?? "",
      observacoes: a.observacoes ?? "",
      modalidadeIds: (a.modalidades ?? []).map((m: any) => m.id),
    });
    setOpen(true);
  }

  function toggleModalidade(id: number, exclusivo: boolean) {
    setForm(f => {
      const has = f.modalidadeIds.includes(id);
      if (has) return { ...f, modalidadeIds: f.modalidadeIds.filter(x => x !== id) };
      let next = [...f.modalidadeIds];
      if (exclusivo) {
        // remove qualquer outra do grupo exclusivo antes de adicionar essa
        next = next.filter(x => !grupoExclusivo.some(g => g.id === x));
      }
      next.push(id);
      return { ...f, modalidadeIds: next };
    });
  }

  function handleSave() {
    if (!form.nomeCompleto.trim()) { toast.error("Informe o nome completo."); return; }
    if (!form.maiorIdade && !form.responsavelNome.trim()) {
      toast.error("Informe o nome do responsável (aluno menor de idade).");
      return;
    }
    const payload = { ...form, dataNascimento: form.dataNascimento || undefined };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-foreground">Alunos</h2>
        </div>
        <Button onClick={openCreate} className="gap-1.5 bg-purple-600 hover:bg-purple-700">
          <Plus className="w-4 h-4" /> Novo Aluno
        </Button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CPF ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Mostrar inativos/desistentes
        </label>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : alunosList?.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum aluno cadastrado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {alunosList?.map((a: any) => (
            <Card key={a.id} className={!a.active ? "opacity-60" : ""}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">{a.nomeCompleto}</p>
                    {!a.maiorIdade && <Badge variant="outline" className="text-xs">Menor de idade</Badge>}
                    {a.statusMatricula === "desistente" && (
                      <Badge className="bg-red-50 text-red-600 border-red-200 text-xs">
                        Desistente {a.dataDesistencia ? `em ${new Date(a.dataDesistencia).toLocaleDateString("pt-BR")}` : ""}
                      </Badge>
                    )}
                    {!a.active && a.statusMatricula !== "desistente" && <Badge variant="outline" className="text-xs">Inativo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.telefone || "—"} {a.email ? `• ${a.email}` : ""}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {(a.modalidades ?? []).map((m: any) => (
                      <Badge key={m.id} className="bg-purple-50 text-purple-700 border-purple-200 text-xs">{m.nome}</Badge>
                    ))}
                    {(a.modalidades ?? []).length === 0 && <span className="text-xs text-muted-foreground">Sem modalidade</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-purple-700">{fmt(a.valorMensalTotal ?? 0)}/mês</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}><Pencil className="w-3.5 h-3.5" /></Button>
                  {a.active ? (
                    <>
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-orange-600 hover:text-orange-700" onClick={() => setDesistenteDialog({ id: a.id, nome: a.nomeCompleto })}>
                        Desistência
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Desativar" onClick={() => setDeactivateId({ id: a.id, nome: a.nomeCompleto })}>
                        <UserX className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => reativarMutation.mutate({ id: a.id })}>
                      Reativar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Formulário de cadastro/edição */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Editar Aluno" : "Novo Aluno"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome completo *</Label>
              <Input value={form.nomeCompleto} onChange={(e) => setForm(f => ({ ...f, nomeCompleto: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data de nascimento</Label>
                <Input type="date" value={form.dataNascimento} onChange={(e) => setForm(f => ({ ...f, dataNascimento: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={(e) => setForm(f => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={(e) => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(00) 00000-0000" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Maior de 18 anos?</Label>
              <Switch checked={form.maiorIdade} onCheckedChange={(v) => setForm(f => ({ ...f, maiorIdade: v }))} />
            </div>

            {!form.maiorIdade && (
              <div className="space-y-3 rounded-lg border border-purple-200 bg-purple-50/50 p-3">
                <p className="text-xs font-semibold text-purple-700">Dados do responsável</p>
                <div className="space-y-1.5">
                  <Label>Nome completo do responsável *</Label>
                  <Input value={form.responsavelNome} onChange={(e) => setForm(f => ({ ...f, responsavelNome: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Vínculo com o aluno (ex: mãe, pai, tutor)</Label>
                  <Input value={form.responsavelVinculo} onChange={(e) => setForm(f => ({ ...f, responsavelVinculo: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>E-mail do responsável</Label>
                    <Input type="email" value={form.responsavelEmail} onChange={(e) => setForm(f => ({ ...f, responsavelEmail: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefone do responsável</Label>
                    <Input value={form.responsavelTelefone} onChange={(e) => setForm(f => ({ ...f, responsavelTelefone: e.target.value }))} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Responsável ciente que deve permanecer na Instituição (se menor de 10 anos)</Label>
                  <Switch checked={form.responsavelPresenteMenor10} onCheckedChange={(v) => setForm(f => ({ ...f, responsavelPresenteMenor10: v }))} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Modalidade(s) — no máximo 1 de {grupoExclusivo.map(m => m.nome).join("/")} + Teatro</Label>
              {(() => {
                const idadeAluno = calcIdade(form.dataNascimento);
                return (
                  <>
                    {idadeAluno === null && (
                      <p className="text-xs text-amber-600">Informe a data de nascimento para ver quais modalidades são compatíveis com a idade.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {activeModalidades.map(m => {
                        const foraDaFaixa = idadeAluno !== null && (
                          (m.idadeMinima != null && idadeAluno < m.idadeMinima) ||
                          (m.idadeMaxima != null && idadeAluno > m.idadeMaxima)
                        );
                        return (
                          <button
                            key={m.id}
                            type="button"
                            disabled={foraDaFaixa}
                            title={foraDaFaixa ? `Fora da faixa etária (${m.idadeMinima ?? 0}-${m.idadeMaxima ?? "∞"} anos)` : undefined}
                            onClick={() => toggleModalidade(m.id, m.grupoExclusivo)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                              foraDaFaixa
                                ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                                : form.modalidadeIds.includes(m.id)
                                ? "bg-purple-600 text-white border-purple-600"
                                : "bg-white text-muted-foreground border-gray-200 hover:border-purple-300"
                            }`}
                          >
                            {m.nome} ({fmt(m.valorMensal)})
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Autorização de uso de imagem</Label>
              <Switch checked={form.autorizacaoImagem} onCheckedChange={(v) => setForm(f => ({ ...f, autorizacaoImagem: v }))} />
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label>Possui alguma deficiência?</Label>
                <Switch checked={form.possuiDeficiencia} onCheckedChange={(v) => setForm(f => ({ ...f, possuiDeficiencia: v }))} />
              </div>
              {form.possuiDeficiencia && (
                <Input
                  placeholder="Qual?"
                  value={form.deficienciaQual}
                  onChange={(e) => setForm(f => ({ ...f, deficienciaQual: e.target.value }))}
                />
              )}
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
            <AlertDialogDescription>O aluno deixa de aparecer nas listas ativas e não gera mais cobrança mensal. O histórico é mantido.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deactivateId && deleteMutation.mutate({ id: deactivateId.id })} className="bg-destructive text-white">
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!desistenteDialog} onOpenChange={(v) => !v && setDesistenteDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar desistência — {desistenteDialog?.nome}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Fica registrada a data de hoje. Pelo regulamento, quem desiste no meio do ano só pode se
            rematricular no próximo período de matrículas.
          </p>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea value={motivoDesistencia} onChange={(e) => setMotivoDesistencia(e.target.value)} className="min-h-[60px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDesistenteDialog(null)}>Cancelar</Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              disabled={desistenteMutation.isPending}
              onClick={() => desistenteDialog && desistenteMutation.mutate({ id: desistenteDialog.id, motivo: motivoDesistencia || undefined })}
            >
              Confirmar Desistência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
