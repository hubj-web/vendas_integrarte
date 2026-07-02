import { type ReactNode } from "react";
import { useSeller } from "@/contexts/SellerContext";
import { Button } from "@/components/ui/button";
import { ShoppingBag, LogOut, Plus, List } from "lucide-react";
import { Link, useLocation } from "wouter";

interface SellerLayoutProps {
  children: ReactNode;
}

export default function SellerLayout({ children }: SellerLayoutProps) {
  const { seller, clearSeller } = useSeller();
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">Gestão de Pedidos</span>
              {seller && (
                <span className="text-xs text-muted-foreground ml-2">— {seller.name}</span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSeller}
            className="text-muted-foreground hover:text-foreground gap-1.5 text-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </Button>
        </div>
      </header>

      {/* Nav tabs */}
      <nav className="border-b border-border bg-card/40">
        <div className="max-w-2xl mx-auto px-4 flex gap-1">
          <Link href="/vendedor/novo-pedido">
            <button
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                location === "/vendedor/novo-pedido"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Plus className="w-4 h-4" />
              Novo Pedido
            </button>
          </Link>
          <Link href="/vendedor/meus-pedidos">
            <button
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                location === "/vendedor/meus-pedidos"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="w-4 h-4" />
              Meus Pedidos
            </button>
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
