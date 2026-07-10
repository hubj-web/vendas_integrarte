import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string }> = {
  production: { label: "Em Produção", className: "status-production" },
  in_route: { label: "Em Rota", className: "status-in_route" },
  packaged: { label: "Empacotado", className: "status-packaged" },
  delivered: { label: "Entregue", className: "status-delivered" },
  paid: { label: "Pago", className: "status-paid" },
  cancelled: { label: "Cancelado", className: "status-cancelled" },
  pending: { label: "Pendente", className: "status-pending" },
  partial: { label: "Parcial", className: "status-partial" },
  planned: { label: "Planejada", className: "status-planned" },
  in_progress: { label: "Em Andamento", className: "status-in_progress" },
  completed: { label: "Concluída", className: "status-completed" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const config = statusConfig[status] ?? { label: status, className: "bg-muted text-muted-foreground border border-border" };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", config.className, className)}>
      {config.label}
    </span>
  );
}
