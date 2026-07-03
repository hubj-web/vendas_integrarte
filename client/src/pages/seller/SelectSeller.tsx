import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSeller } from "@/contexts/SellerContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, User, ChevronRight, Lock, PenLine, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

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
    // Usa id=-1 para indicar vendedor avulso (sem vínculo a um usuário cadastrado)
    setSeller({ id: -1, name });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Logo / Header */}
      <div className="mb-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          <ShoppingBag className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-serif font-bold text-foreground tracking-tight">Gestão de Pedidos</h1>
        <p className="text-muted-foreground mt-2">
          {showCustom ? "Digite seu nome para continuar" : "Selecione seu nome para continuar"}
        </p>
      </div>

      {/* Seller list ou campo customizado */}
      <div className="w-full max-w-sm space-y-3">
        {showCustom ? (
          <form onSubmit={handleCustomSubmit} className="space-y-3">
            <Input
              autoFocus
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="Digite seu nome completo"
              className="h-14 text-base px-4 rounded-xl border-border bg-card"
            />
            <Button
              type="submit"
              disabled={!customName.trim()}
              className="w-full h-12 rounded-xl font-semibold"
            >
              Continuar
            </Button>
            <button
              type="button"
              onClick={() => { setShowCustom(false); setCustomName(""); }}
              className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors pt-1"
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
            {sellers && sellers.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelect(s.id, s.name ?? "Vendedor")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-card/80 hover:border-primary/40 transition-all duration-200 group text-left active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <span className="flex-1 font-medium text-foreground">{s.name}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}

            {/* Opção "Outro" */}
            <button
              onClick={() => setShowCustom(true)}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-dashed border-border bg-card/50 hover:bg-card hover:border-primary/40 transition-all duration-200 group text-left active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                <PenLine className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="flex-1 font-medium text-muted-foreground group-hover:text-foreground transition-colors">Outro...</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          </>
        )}
      </div>

      {/* Discrete admin link */}
      {!showCustom && (
        <div className="mt-16 text-center">
          <Link href="/admin">
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              <Lock className="w-3 h-3" />
              <span>Área administrativa</span>
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
