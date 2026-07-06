import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSeller } from "@/contexts/SellerContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { User, ChevronRight, Lock, PenLine, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const LOGO_URL = "/integrarte-logo.png";

export default function SelectSeller() {
  const { setSeller } = useSeller();
  const { data: sellers, isLoading } = trpc.seller.listSellers.useQuery();
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");

  const handleSelect = (id: number, name: string) => {
    setSeller({ id, name });
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = customName.trim();
    if (!name) return;
    setSeller({ id: -1, name });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex flex-col items-center justify-center p-6">
      {/* Logo Integrarte */}
      <div className="mb-8 text-center animate-fade-in-up">
        <img
          src={LOGO_URL}
          alt="Integrarte"
          className="h-28 w-auto mx-auto mb-3 drop-shadow-sm"
        />
        <p className="text-muted-foreground text-sm font-medium">
          {showCustom ? "Digite seu nome para continuar" : "Selecione seu nome para continuar"}
        </p>
      </div>

      {/* Seller list ou campo customizado */}
      <div className="w-full max-w-sm space-y-2.5 animate-fade-in-up">
        {showCustom ? (
          <form onSubmit={handleCustomSubmit} className="space-y-3">
            <Input
              autoFocus
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="Digite seu nome completo"
              className="h-14 text-base px-4 rounded-xl border-2 border-blue-200 focus:border-primary bg-white shadow-sm"
            />
            <Button
              type="submit"
              disabled={!customName.trim()}
              className="w-full h-12 rounded-xl font-bold text-base bg-primary hover:bg-primary/90 shadow-md"
            >
              Continuar
            </Button>
            <button
              type="button"
              onClick={() => { setShowCustom(false); setCustomName(""); }}
              className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors pt-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar à lista
            </button>
          </form>
        ) : isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))
        ) : (
          <>
            {sellers && sellers.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => handleSelect(s.id, s.name ?? "Vendedor")}
                style={{ animationDelay: `${idx * 40}ms` }}
                className="animate-fade-in-up w-full flex items-center gap-4 p-4 rounded-xl border-2 border-transparent bg-white shadow-sm hover:border-primary/30 hover:shadow-md transition-all duration-200 group text-left active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <span className="flex-1 font-semibold text-foreground text-base">{s.name}</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}

            {/* Opção "Outro" */}
            <button
              onClick={() => setShowCustom(true)}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-gray-200 bg-white/60 hover:bg-white hover:border-secondary/40 transition-all duration-200 group text-left active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center shrink-0 group-hover:bg-secondary/20 transition-colors">
                <PenLine className="w-5 h-5 text-secondary group-hover:text-secondary transition-colors" />
              </div>
              <span className="flex-1 font-semibold text-muted-foreground group-hover:text-foreground transition-colors">Outro...</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-secondary transition-colors" />
            </button>
          </>
        )}
      </div>

      {/* Discrete admin link */}
      {!showCustom && (
        <div className="mt-14 text-center">
          <Link href="/admin">
            <button className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-gray-500 transition-colors">
              <Lock className="w-3 h-3" />
              <span>Área administrativa</span>
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
