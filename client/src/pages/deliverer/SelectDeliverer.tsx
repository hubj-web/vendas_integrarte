import { trpc } from "@/lib/trpc";
import { useDeliverer } from "@/contexts/DelivererContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, User, ChevronRight } from "lucide-react";

export default function SelectDeliverer() {
  const { setDeliverer } = useDeliverer();
  const { data: deliverers, isLoading } = trpc.deliveryPublic.listDeliverers.useQuery();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="mb-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          <Truck className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-serif font-bold text-foreground tracking-tight">Área do Entregador</h1>
        <p className="text-muted-foreground mt-2">Selecione seu nome para ver suas rotas</p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))
        ) : deliverers && deliverers.length > 0 ? (
          deliverers.map((d) => (
            <button
              key={d.id}
              onClick={() => setDeliverer({ id: d.id, name: d.name ?? "Entregador" })}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-card/80 hover:border-primary/40 transition-all duration-200 group text-left active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-primary" />
              </div>
              <span className="flex-1 font-medium text-foreground">{d.name}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>Nenhum entregador cadastrado.</p>
          </div>
        )}
      </div>
    </div>
  );
}
