import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Wallet, GraduationCap, Users, Check, Clock } from "lucide-react";

const fmt = (v: string | number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

const statusColors: Record<string, string> = {
  pago: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pendente: "bg-amber-100 text-amber-700 border-amber-200",
  atrasado: "bg-red-100 text-red-700 border-red-200",
  isento: "bg-gray-100 text-gray-600 border-gray-200",
};
const statusLabels: Record<string, string> = { pago: "Pago", pendente: "Pendente", atrasado: "Atrasado", isento: "Isento" };

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = -6; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts.reverse();
}

export default function Pagamentos() {
  const [mes, setMes] = useState(currentMonth());
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-foreground">Pagamentos</h2>
        </div>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions().map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="alunos">
        <TabsList>
          <TabsTrigger value="alunos" className="gap-1.5"><GraduationCap className="w-4 h-4" /> Alunos</TabsTrigger>
          <TabsTrigger value="professores" className="gap-1.5"><Users className="w-4 h-4" /> Professores</TabsTrigger>
        </TabsList>
        <TabsContent value="alunos"><PagamentosAlunosTab mes={mes} /></TabsContent>
        <TabsContent value="professores"><PagamentosProfessoresTab mes={mes} /></TabsContent>
      </Tabs>
    </div>
  );
}

function PagamentosAlunosTab({ mes }: { mes: string }) {
  const utils = trpc.useUtils();
  const { data: pagamentos, isLoading } = trpc.gestao.pagamentosAlunos.listByMonth.useQuery({ mesReferencia: mes });
  const [payDialog, setPayDialog] = useState<{ id: number; nome: string; valorEsperado: string } | null>(null);
  const [payForm, setPayForm] = useState({ valorPago: "", dataPagamento: new Date().toISOString().slice(0, 10), formaPagamento: "pix" as "pix" | "dinheiro" | "transferencia" | "outro", observacoes: "" });

  const registerMutation = trpc.gestao.pagamentosAlunos.registerPayment.useMutation({
    onSuccess: () => { utils.gestao.pagamentosAlunos.listByMonth.invalidate(); toast.success("Pagamento registrado!"); setPayDialog(null); },
    onError: (e) => toast.error(e.message),
  });
  const statusMutation = trpc.gestao.pagamentosAlunos.updateStatus.useMutation({
    onSuccess: () => { utils.gestao.pagamentosAlunos.listByMonth.invalidate(); toast.success("Status atualizado!"); },
    onError: (e) => toast.error(e.message),
  });

  function openPay(p: any) {
    setPayDialog({ id: p.id, nome: p.alunoNome, valorEsperado: p.valorEsperado });
    setPayForm({ valorPago: p.valorEsperado, dataPagamento: new Date().toISOString().slice(0, 10), formaPagamento: "pix", observacoes: "" });
  }

  if (isLoading) return <div className="mt-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>;

  const total = pagamentos?.reduce((acc, p) => acc + parseFloat(p.valorEsperado), 0) ?? 0;
  const recebido = pagamentos?.filter(p => p.status === "pago").reduce((acc, p) => acc + parseFloat(p.valorPago ?? "0"), 0) ?? 0;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-3 flex-wrap text-sm">
        <span className="text-muted-foreground">Esperado: <strong className="text-foreground">{fmt(total)}</strong></span>
        <span className="text-muted-foreground">Recebido: <strong className="text-emerald-600">{fmt(recebido)}</strong></span>
      </div>
      {pagamentos?.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum aluno com contribuição prevista neste mês.</p>
      ) : (
        <div className="space-y-2">
          {pagamentos?.map((p: any) => (
            <Card key={p.id}>
              <CardContent className="p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground">{p.alunoNome}</p>
                  <p className="text-xs text-muted-foreground">{p.alunoTelefone || "—"}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-foreground">{fmt(p.valorEsperado)}</span>
                  <Badge className={`text-xs ${statusColors[p.status]}`}>{statusLabels[p.status]}</Badge>
                  {p.status !== "pago" ? (
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => openPay(p)}>
                      <Check className="w-3 h-3" /> Registrar
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => statusMutation.mutate({ id: p.id, status: "pendente" })}>
                      <Clock className="w-3 h-3" /> Reverter
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!payDialog} onOpenChange={(v) => !v && setPayDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pagamento — {payDialog?.nome}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Valor pago</Label>
              <Input type="number" step="0.01" value={payForm.valorPago} onChange={(e) => setPayForm(f => ({ ...f, valorPago: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Data do pagamento</Label>
              <Input type="date" value={payForm.dataPagamento} onChange={(e) => setPayForm(f => ({ ...f, dataPagamento: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={payForm.formaPagamento} onValueChange={(v) => setPayForm(f => ({ ...f, formaPagamento: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={payForm.observacoes} onChange={(e) => setPayForm(f => ({ ...f, observacoes: e.target.value }))} className="min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={registerMutation.isPending}
              onClick={() => payDialog && registerMutation.mutate({ id: payDialog.id, ...payForm })}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PagamentosProfessoresTab({ mes }: { mes: string }) {
  const utils = trpc.useUtils();
  const { data: pagamentos, isLoading } = trpc.gestao.pagamentosProfessores.listByMonth.useQuery({ mesReferencia: mes });
  const [payDialog, setPayDialog] = useState<{ id: number; nome: string; valorEsperado: string; pix: string | null } | null>(null);
  const [payForm, setPayForm] = useState({ valorPago: "", dataPagamento: new Date().toISOString().slice(0, 10), formaPagamento: "pix" as "pix" | "dinheiro" | "transferencia" | "outro", observacoes: "" });

  const registerMutation = trpc.gestao.pagamentosProfessores.registerPayment.useMutation({
    onSuccess: () => { utils.gestao.pagamentosProfessores.listByMonth.invalidate(); toast.success("Pagamento registrado!"); setPayDialog(null); },
    onError: (e) => toast.error(e.message),
  });
  const statusMutation = trpc.gestao.pagamentosProfessores.updateStatus.useMutation({
    onSuccess: () => { utils.gestao.pagamentosProfessores.listByMonth.invalidate(); toast.success("Status atualizado!"); },
    onError: (e) => toast.error(e.message),
  });

  function openPay(p: any) {
    setPayDialog({ id: p.id, nome: p.professorNome, valorEsperado: p.valorEsperado, pix: p.professorPix });
    setPayForm({ valorPago: p.valorEsperado, dataPagamento: new Date().toISOString().slice(0, 10), formaPagamento: "pix", observacoes: "" });
  }

  if (isLoading) return <div className="mt-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>;

  const total = pagamentos?.reduce((acc, p) => acc + parseFloat(p.valorEsperado), 0) ?? 0;
  const pago = pagamentos?.filter(p => p.status === "pago").reduce((acc, p) => acc + parseFloat(p.valorPago ?? "0"), 0) ?? 0;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-3 flex-wrap text-sm">
        <span className="text-muted-foreground">Total previsto: <strong className="text-foreground">{fmt(total)}</strong></span>
        <span className="text-muted-foreground">Já pago: <strong className="text-emerald-600">{fmt(pago)}</strong></span>
      </div>
      {pagamentos?.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum professor com bolsa cultura prevista neste mês.</p>
      ) : (
        <div className="space-y-2">
          {pagamentos?.map((p: any) => (
            <Card key={p.id}>
              <CardContent className="p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground">{p.professorNome}</p>
                  <p className="text-xs text-muted-foreground">{p.professorPix ? `PIX: ${p.professorPix}` : "Sem chave PIX cadastrada"}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-foreground">{fmt(p.valorEsperado)}</span>
                  <Badge className={`text-xs ${statusColors[p.status]}`}>{statusLabels[p.status]}</Badge>
                  {p.status !== "pago" ? (
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => openPay(p)}>
                      <Check className="w-3 h-3" /> Registrar
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => statusMutation.mutate({ id: p.id, status: "pendente" })}>
                      <Clock className="w-3 h-3" /> Reverter
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!payDialog} onOpenChange={(v) => !v && setPayDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pagamento — {payDialog?.nome}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {payDialog?.pix && (
              <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2.5">Chave PIX: <strong>{payDialog.pix}</strong></p>
            )}
            <div className="space-y-1.5">
              <Label>Valor pago</Label>
              <Input type="number" step="0.01" value={payForm.valorPago} onChange={(e) => setPayForm(f => ({ ...f, valorPago: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Data do pagamento</Label>
              <Input type="date" value={payForm.dataPagamento} onChange={(e) => setPayForm(f => ({ ...f, dataPagamento: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={payForm.formaPagamento} onValueChange={(v) => setPayForm(f => ({ ...f, formaPagamento: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={payForm.observacoes} onChange={(e) => setPayForm(f => ({ ...f, observacoes: e.target.value }))} className="min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={registerMutation.isPending}
              onClick={() => payDialog && registerMutation.mutate({ id: payDialog.id, ...payForm })}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
