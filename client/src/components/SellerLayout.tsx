import { type ReactNode } from "react";
import { useSeller } from "@/contexts/SellerContext";
import { Button } from "@/components/ui/button";
import { LogOut, Plus, List } from "lucide-react";
import { Link, useLocation } from "wouter";

const LOGO_URL = "/integrarte-logo.png";

interface SellerLayoutProps {
  children: ReactNode;
}

export default function SellerLayout({ children }: SellerLayoutProps) {
  const { seller, clearSeller } = useSeller();
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur-sm shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Integrarte" className="h-10 w-auto object-contain" />
            {seller && (
              <div className="hidden sm:block">
                <span className="text-xs text-muted-foreground">Olá,</span>
                <span className="text-sm font-bold text-primary ml-1">{seller.name}</span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSeller}
            className="text-muted-foreground hover:text-destructive gap-1.5 text-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </Button>
        </div>
      </header>

      {/* Nav tabs */}
      <nav className="border-b border-gray-100 bg-white/70">
        <div className="max-w-2xl mx-auto px-4 flex gap-1">
          <Link href="/vendedor/novo-pedido">
            <button
              className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
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
              className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
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
