import { type ReactNode } from "react";
import { useDeliverer } from "@/contexts/DelivererContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { Redirect } from "wouter";

const LOGO_URL = "/integrarte-logo.png";

interface DelivererLayoutProps {
  children: ReactNode;
}

export default function DelivererLayout({ children }: DelivererLayoutProps) {
  const { deliverer, clearDeliverer } = useDeliverer();

  if (!deliverer) {
    return <Redirect to="/entregador" />;
  }

  const handleLogout = () => {
    clearDeliverer();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur-sm shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Integrarte" className="h-10 w-auto object-contain" />
            {deliverer && (
              <div className="hidden sm:block">
                <span className="text-xs text-muted-foreground">Entregador:</span>
                <span className="text-sm font-bold text-secondary ml-1">{deliverer.name}</span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-destructive gap-1.5 text-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
