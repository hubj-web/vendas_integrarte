import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { History } from "lucide-react";

const dateFmt = (d: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));

export default function Activities() {
  const { data: logs, isLoading } = trpc.storeAdmin.activityLog.useQuery({ limit: 100 });

  return (
    <div className="space-y-6">
      <PageHeader title="Atividades" description="Histórico de mudanças feitas na Loja Pública — quem fez o quê e quando" />
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhuma atividade registrada ainda.
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log: any) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-3">
                  <p className="text-sm">{log.description}</p>
                  <span className="text-xs text-muted-foreground shrink-0">{dateFmt(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
