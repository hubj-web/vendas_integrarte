import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ClipboardCheck, AlertTriangle, CalendarCheck, ListChecks } from "lucide-react";

function proximoSabado(): string {
  const hoje = new Date();
  const dia = hoje.getDay();
  const diff = dia === 6 ? 0 : (6 - dia + 7) % 7;
  const sabado = new Date(hoje);
  sabado.setDate(hoje.getDate() + diff);
  return sabado.toISOString().slice(0, 10);
}

export default function Frequencia() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5 text-purple-600" />
        <h2 className="text-lg font-semibold text-foreground">Frequência</h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Máximo de 3 faltas não-justificadas por trimestre, conforme o regulamento. Falta no estudo
        teórico de sábado conta como falta integral.
      </p>

      <Tabs defaultValue="chamada">
        <TabsList>
          <TabsTrigger value="chamada" className="gap-1.5"><CalendarCheck className="w-4 h-4" /> Chamada</TabsTrigger>
          <TabsTrigger value="resumo" className="gap-1.5"><ListChecks className="w-4 h-4" /> Resumo de Faltas</TabsTrigger>
        </TabsList>
        <TabsContent value="chamada"><ChamadaTab /></TabsContent>
        <TabsContent value="resumo"><ResumoFaltasTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ChamadaTab() {
  const utils = trpc.useUtils();
  const [data, setData] = useState(proximoSabado());
  const { data: chamada, isLoading } = trpc.gestao.frequencia.listByDate.useQuery({ data });
  const [justificarId, setJustificarId] = useState<number | null>(null);
  const [justificativa, setJustificativa] = useState("");

  const marcarMutation = trpc.gestao.frequencia.marcarPresenca.useMutation({
    onSuccess: () => { utils.gestao.frequencia.listByDate.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  function togglePresenca(registroId: number, presenteAtual: boolean) {
    if (presenteAtual) {
      // vai marcar falta — abre o campo de justificativa opcional
      setJustificarId(registroId);
      setJustificativa("");
    } else {
      marcarMutation.mutate({ id: registroId, presente: true });
    }
  }

  function confirmarFalta(justificada: boolean) {
    if (!justificarId) return;
    marcarMutation.mutate({ id: justificarId, presente: false, justificada, justificativa: justificativa || undefined });
    setJustificarId(null);
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="max-w-xs space-y-1.5">
        <Label>Data (sábado)</Label>
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : chamada?.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum aluno ativo para fazer chamada.</p>
      ) : (
        <div className="space-y-2">
          {chamada?.map((c) => {
            const presente = c.registro?.presente ?? true;
            const justificada = c.registro?.justificada ?? false;
            return (
              <Card key={c.alunoId}>
                <CardContent className="p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">{c.alunoNome}</p>
                    {!presente && (
                      <Badge className={`text-xs mt-1 ${justificada ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                        Falta {justificada ? "justificada" : "não justificada"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium ${presente ? "text-emerald-600" : "text-red-500"}`}>
                      {presente ? "Presente" : "Ausente"}
                    </span>
                    <Switch
                      checked={presente}
                      onCheckedChange={() => c.registro && togglePresenca(c.registro.id, presente)}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Diálogo simples embutido pra justificar a falta */}
      {justificarId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setJustificarId(null)}>
          <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">Essa falta é justificada?</p>
            <p className="text-xs text-muted-foreground">Atestado médico ou de trabalho não conta para o limite de faltas do trimestre.</p>
            <Textarea placeholder="Observação (opcional)" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className="min-h-[60px]" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => confirmarFalta(false)}>Não justificada</Button>
              <Button className="flex-1 bg-amber-500 hover:bg-amber-600" onClick={() => confirmarFalta(true)}>Justificada</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function trimestreAtual() {
  const mes = new Date().getMonth(); // 0-11
  return Math.floor(mes / 3) + 1;
}

function ResumoFaltasTab() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [trimestre, setTrimestre] = useState(trimestreAtual());

  const { data: resumo, isLoading } = trpc.gestao.frequencia.faltasPorTrimestre.useQuery({ ano, trimestre });

  const trimestreLabels: Record<number, string> = { 1: "1º Trimestre (Jan-Mar)", 2: "2º Trimestre (Abr-Jun)", 3: "3º Trimestre (Jul-Set)", 4: "4º Trimestre (Out-Dez)" };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-3 flex-wrap">
        <div className="space-y-1.5">
          <Label>Ano</Label>
          <Input type="number" className="w-28" value={ano} onChange={(e) => setAno(Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Trimestre</Label>
          <Select value={String(trimestre)} onValueChange={(v) => setTrimestre(Number(v))}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map(t => <SelectItem key={t} value={String(t)}>{trimestreLabels[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : resumo?.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum registro de falta neste período.</p>
      ) : (
        <div className="space-y-2">
          {resumo?.map((r) => (
            <Card key={r.alunoId} className={r.acimaDoLimite ? "border-red-200 bg-red-50/40" : ""}>
              <CardContent className="p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {r.acimaDoLimite && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                  <p className="font-medium text-sm text-foreground">{r.alunoNome}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  <span>{r.faltasJustificadas} justificada(s)</span>
                  <Badge className={r.acimaDoLimite ? "bg-red-100 text-red-700 border-red-200" : "bg-gray-100 text-gray-600 border-gray-200"}>
                    {r.faltasNaoJustificadas} não justificada(s)
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
