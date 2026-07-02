import { type ReactNode } from "react";
import { useDeliverer } from "@/contexts/DelivererContext";
import { Button } from "@/components/ui/button";
import { Truck, LogOut } from "lucide-react";

interface DelivererLayoutProps {
  children: ReactNode;
}

export default function DelivererLayout({ children }: DelivererLayoutProps) {
  const { deliverer, clearDeliverer } = useDeliverer();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Truck className="w-4 h-4 text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">Área do Entregador</span>
              {deliverer && (
                <span className="text-xs text-muted-foreground ml-2">— {deliverer.name}</span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearDeliverer}
            className="text-muted-foreground hover:text-foreground gap-1.5 text-xs"
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
