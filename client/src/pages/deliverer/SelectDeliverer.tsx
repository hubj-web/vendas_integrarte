import { trpc } from "@/lib/trpc";
import { useDeliverer } from "@/contexts/DelivererContext";
import { Skeleton } from "@/components/ui/skeleton";
import { User, ChevronRight } from "lucide-react";

const LOGO_URL = "/integrarte-logo.png";

export default function SelectDeliverer() {
  const { setDeliverer } = useDeliverer();
  const { data: deliverers, isLoading } = trpc.deliveryPublic.listDeliverers.useQuery();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center animate-fade-in-up">
        <img
          src={LOGO_URL}
          alt="Integrarte"
          className="h-28 w-auto mx-auto mb-3 drop-shadow-sm"
        />
        <p className="text-muted-foreground text-sm font-medium">Selecione seu nome para ver suas rotas</p>
      </div>

      <div className="w-full max-w-sm space-y-2.5 animate-fade-in-up">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))
        ) : deliverers && deliverers.length > 0 ? (
          deliverers.map((d, idx) => (
            <button
              key={d.id}
              onClick={() => setDeliverer({ id: d.id, name: d.name ?? "Entregador" })}
              style={{ animationDelay: `${idx * 40}ms` }}
              className="animate-fade-in-up w-full flex items-center gap-4 p-4 rounded-xl border-2 border-transparent bg-white shadow-sm hover:border-secondary/30 hover:shadow-md transition-all duration-200 group text-left active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center shrink-0 group-hover:bg-secondary/20 transition-colors">
                <User className="w-5 h-5 text-secondary" />
              </div>
              <span className="flex-1 font-semibold text-foreground text-base">{d.name}</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-secondary transition-colors" />
            </button>
          ))
        ) : (
          <div className="text-center py-10 text-muted-foreground bg-white rounded-2xl shadow-sm border border-gray-100 px-6">
            <p className="font-medium">Nenhum entregador cadastrado.</p>
            <p className="text-sm mt-1">Acesse o painel administrativo para cadastrar entregadores.</p>
          </div>
        )}
      </div>
    </div>
  );
}
